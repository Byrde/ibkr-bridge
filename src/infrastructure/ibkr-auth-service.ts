import { createHmac } from 'crypto';
import { authenticator } from 'otplib';
import type {
  AuthenticationService,
  AuthStatusResponse,
  Credentials,
  HeartbeatResult,
  Session,
  SessionRepository,
  SsoInitResponse,
  TickleResponse,
  TOTPSecret,
  TotpChallengeResponse,
} from '../domain/session';
import type { GatewayClient } from './gateway-client';
import { HeadlessLoginService } from './headless-login-service';
import { createLogger } from './logger';

const log = createLogger('Auth');

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_CONNECTED'
      | 'SESSION_INIT_FAILED'
      | 'COMPETING_SESSION'
      | 'TOTP_REQUIRED'
      | 'TOTP_FAILED'
      | 'HEADLESS_LOGIN_FAILED'
      | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface HeadlessLoginProvider {
  login(credentials: {
    username: string;
    password: string;
    totpSecret?: string;
    paperTrading?: boolean;
  }): Promise<{ success: boolean; error?: string; requiresManualIntervention?: boolean }>;
}

/**
 * Implements IBKR authentication using the Client Portal Gateway API.
 *
 * Authentication flow:
 * 1. HeadlessLoginService automates the gateway web login using Playwright
 * 2. Session is verified via /iserver/auth/status
 * 3. Session is maintained via periodic /tickle calls (heartbeat)
 */
export class IbkrAuthService implements AuthenticationService {
  private headlessLoginService: HeadlessLoginProvider;
  private currentTotpSecret?: string;

  constructor(
    private readonly client: GatewayClient,
    private readonly sessionRepo: SessionRepository,
    private readonly totpSecret?: TOTPSecret,
    headlessLoginService?: HeadlessLoginProvider
  ) {
    this.headlessLoginService = headlessLoginService ?? new HeadlessLoginService(client.getBaseUrl(), {
      headless: true,
      timeout: 60000,
    });
  }

  async login(credentials: Credentials): Promise<Session> {
    this.sessionRepo.updateSession({ status: 'authenticating' });

    // Use totpSecret from credentials if provided, otherwise fall back to constructor-injected one
    this.currentTotpSecret = credentials.totpSecret ?? this.totpSecret?.secret;

    try {
      // Check if already authenticated
      try {
        const status = await this.checkAuthStatus();
        if (status.authenticated) {
          log.info('Already authenticated');
          this.sessionRepo.updateSession({ status: 'authenticated', authenticatedAt: new Date() });
          return this.sessionRepo.getSession();
        }
      } catch {
        // Expected when not logged in
        log.debug('No existing session');
      }

      // Perform headless browser login
      log.info(`Starting browser login (paperTrading=${credentials.paperTrading ?? false})`);
      const loginResult = await this.headlessLoginService.login({
        username: credentials.username,
        password: credentials.password,
        totpSecret: this.currentTotpSecret,
        paperTrading: credentials.paperTrading,
      });

      if (!loginResult.success) {
        this.sessionRepo.updateSession({ status: 'disconnected' });
        if (loginResult.requiresManualIntervention) {
          throw new AuthenticationError(loginResult.error ?? 'Login requires manual intervention', 'TOTP_REQUIRED');
        }
        throw new AuthenticationError(loginResult.error ?? 'Headless login failed', 'HEADLESS_LOGIN_FAILED');
      }

      log.info('Browser login successful, verifying session');

      // Give gateway time to register the session
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify session status
      let finalStatus;
      try {
        finalStatus = await this.checkAuthStatus();
      } catch {
        await new Promise(resolve => setTimeout(resolve, 3000));
        finalStatus = await this.checkAuthStatus();
      }

      if (finalStatus.authenticated) {
        log.info('Session authenticated');
        this.sessionRepo.updateSession({ status: 'authenticated', authenticatedAt: new Date() });
      } else if (finalStatus.competing) {
        throw new AuthenticationError('Another session is active', 'COMPETING_SESSION');
      } else {
        // Try SSO init as fallback
        log.debug('Trying SSO init fallback');
        try {
          const initResponse = await this.initializeBrokerageSession();
          if (initResponse.authenticated) {
            this.sessionRepo.updateSession({ status: 'authenticated', authenticatedAt: new Date() });
          } else if (this.isTotpChallenge(initResponse)) {
            await this.handleTotpChallenge(initResponse.challenge!);
          } else {
            throw new AuthenticationError('Session initialization failed', 'SESSION_INIT_FAILED');
          }
        } catch (initError) {
          const retryStatus = await this.checkAuthStatus();
          if (retryStatus.authenticated) {
            this.sessionRepo.updateSession({ status: 'authenticated', authenticatedAt: new Date() });
          } else {
            throw initError;
          }
        }
      }

      return this.sessionRepo.getSession();
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      this.sessionRepo.updateSession({ status: 'disconnected' });
      throw new AuthenticationError(
        `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN'
      );
    }
  }

  async checkAuthStatus(): Promise<AuthStatusResponse> {
    const response = await this.client.get<AuthStatusResponse>('/v1/api/iserver/auth/status');
    return {
      connected: response.connected ?? false,
      authenticated: response.authenticated ?? false,
      competing: response.competing ?? false,
      fail: response.fail,
      message: response.message,
    };
  }

  private async initializeBrokerageSession(): Promise<SsoInitResponse> {
    const machineId = this.generateMachineId();
    const mac = this.generateMacAddress();

    return await this.client.post<SsoInitResponse>('/v1/api/iserver/auth/ssodh/init', {
      compete: true,
      locale: 'en_US',
      mac,
      machineId,
      username: '-',
    });
  }

  private generateMachineId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateMacAddress(): string {
    const hex = '0123456789ABCDEF';
    const pairs: string[] = [];
    for (let i = 0; i < 6; i++) {
      pairs.push(hex.charAt(Math.floor(Math.random() * 16)) + hex.charAt(Math.floor(Math.random() * 16)));
    }
    return pairs.join('-');
  }

  private isTotpChallenge(response: SsoInitResponse): boolean {
    return !response.authenticated && response.challenge !== undefined && response.challenge.length > 0;
  }

  private async handleTotpChallenge(challenge: string): Promise<void> {
    this.sessionRepo.updateSession({ status: 'awaiting_totp' });

    if (!this.currentTotpSecret) {
      throw new AuthenticationError('TOTP challenge received but no TOTP secret configured', 'TOTP_REQUIRED');
    }

    const totpCode = this.generateTOTP();
    if (!totpCode) {
      throw new AuthenticationError('Failed to generate TOTP code', 'TOTP_FAILED');
    }

    const response = this.computeTotpResponse(challenge, totpCode);
    await this.submitTotpResponse(response);
  }

  computeTotpResponse(challenge: string, totpCode: string): string {
    const challengeBuffer = Buffer.from(challenge, 'hex');
    const hmac = createHmac('sha1', totpCode);
    hmac.update(challengeBuffer);
    return hmac.digest('hex');
  }

  private async submitTotpResponse(response: string): Promise<void> {
    const result = await this.client.post<TotpChallengeResponse>('/v1/api/iserver/auth/ssodh/init', { response });

    if (result.authenticated) {
      this.sessionRepo.updateSession({ status: 'authenticated', authenticatedAt: new Date() });
    } else {
      throw new AuthenticationError(result.error ?? result.message ?? 'TOTP verification failed', 'TOTP_FAILED');
    }
  }

  async submitTOTP(code: string): Promise<Session> {
    const session = this.sessionRepo.getSession();
    if (session.status !== 'awaiting_totp') {
      throw new AuthenticationError('No pending TOTP challenge', 'TOTP_FAILED');
    }

    const initResponse = await this.initializeBrokerageSession();

    if (!this.isTotpChallenge(initResponse)) {
      if (initResponse.authenticated) {
        this.sessionRepo.updateSession({ status: 'authenticated', authenticatedAt: new Date() });
        return this.sessionRepo.getSession();
      }
      throw new AuthenticationError('No TOTP challenge in response', 'TOTP_FAILED');
    }

    const response = this.computeTotpResponse(initResponse.challenge!, code);
    await this.submitTotpResponse(response);
    return this.sessionRepo.getSession();
  }

  generateTOTP(): string | null {
    const secret = this.currentTotpSecret ?? this.totpSecret?.secret;
    if (!secret) return null;
    return authenticator.generate(secret);
  }

  async heartbeat(): Promise<HeartbeatResult> {
    const now = new Date();

    try {
      const response = await this.client.post<TickleResponse>('/v1/api/tickle');
      this.sessionRepo.updateSession({ lastHeartbeat: now });

      // Parse SSO expiration if present
      // The gateway returns ssoExpires as milliseconds until expiration, not an absolute timestamp
      // Convert to absolute timestamp by adding to current time
      let ssoExpires: Date | undefined;
      if (response.ssoExpires !== undefined && response.ssoExpires > 0) {
        // If value is small (less than year 2000 in ms), treat as relative milliseconds
        // Otherwise treat as absolute timestamp
        const YEAR_2000_MS = 946684800000;
        if (response.ssoExpires < YEAR_2000_MS) {
          ssoExpires = new Date(now.getTime() + response.ssoExpires);
        } else {
          ssoExpires = new Date(response.ssoExpires);
        }
      }

      // Check if session is still valid via iserver auth status
      const isAuthenticated = response.iserver?.authStatus?.authenticated ?? true;
      const isCompeting = response.iserver?.authStatus?.competing ?? response.collission ?? false;

      // Check if SSO session has expired
      const ssoExpired = ssoExpires ? ssoExpires <= now : false;

      // Session is valid if authenticated and not expired
      const valid = isAuthenticated && !ssoExpired;

      if (!valid) {
        log.warn('Session expired or no longer authenticated', {
          authenticated: isAuthenticated,
          ssoExpired,
          ssoExpires: ssoExpires?.toISOString(),
        });
        this.sessionRepo.updateSession({ status: 'expired' });
      } else if (isCompeting) {
        log.warn('Competing session detected');
      } else {
        log.debug('Heartbeat successful', {
          ssoExpires: ssoExpires?.toISOString(),
        });
      }

      return {
        valid,
        ssoExpires,
        competing: isCompeting,
      };
    } catch (error) {
      log.error('Heartbeat failed', error instanceof Error ? error.message : String(error));

      // On heartbeat failure, we don't immediately mark as expired
      // The session might still be valid, just a network hiccup
      // However, we do update lastHeartbeat to track the attempt
      this.sessionRepo.updateSession({ lastHeartbeat: now });

      // Return invalid to signal the caller should handle this
      return {
        valid: false,
        competing: false,
      };
    }
  }

  async logout(): Promise<void> {
    await this.client.post('/v1/api/logout');
    this.sessionRepo.clearSession();
  }

  isAuthenticated(): boolean {
    return this.sessionRepo.getSession().status === 'authenticated';
  }
}
