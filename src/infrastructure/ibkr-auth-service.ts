import { authenticator } from 'otplib';
import type {
  AuthenticationService,
  AuthStatusResponse,
  Credentials,
  Session,
  SessionRepository,
  SsoInitResponse,
  TOTPSecret,
} from '../domain/session';
import type { GatewayClient } from './gateway-client';

/**
 * Error thrown when IBKR authentication fails.
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_CONNECTED' | 'SESSION_INIT_FAILED' | 'COMPETING_SESSION' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Implements IBKR authentication using the Client Portal Gateway API.
 *
 * The authentication flow:
 * 1. User logs in via the gateway web interface (https://localhost:5000)
 * 2. This service calls /iserver/auth/ssodh/init to initialize the brokerage session
 * 3. Session is maintained via periodic /tickle calls (heartbeat)
 *
 * Note: The gateway does not support programmatic credential submission.
 * Initial authentication must be done through the web interface.
 */
export class IbkrAuthService implements AuthenticationService {
  constructor(
    private readonly client: GatewayClient,
    private readonly sessionRepo: SessionRepository,
    private readonly totpSecret?: TOTPSecret
  ) {}

  /**
   * Initializes a brokerage session after web-based login.
   *
   * This does NOT submit credentials programmatically. The user must first
   * authenticate via the gateway web interface. This method then initializes
   * the API session for trading.
   *
   * @param _credentials - Currently unused; web login required
   * @returns The current session state
   * @throws AuthenticationError if session initialization fails
   */
  async login(_credentials: Credentials): Promise<Session> {
    this.sessionRepo.updateSession({ status: 'authenticating' });

    try {
      // First check if we're already connected to the gateway
      const status = await this.checkAuthStatus();

      if (!status.connected) {
        this.sessionRepo.updateSession({ status: 'disconnected' });
        throw new AuthenticationError(
          'Gateway is not connected to IBKR backend. Please login via the gateway web interface.',
          'NOT_CONNECTED'
        );
      }

      // If already authenticated, just update session and return
      if (status.authenticated) {
        this.sessionRepo.updateSession({
          status: 'authenticated',
          authenticatedAt: new Date(),
        });
        return this.sessionRepo.getSession();
      }

      // Initialize the brokerage session
      const initResponse = await this.initializeBrokerageSession();

      if (initResponse.authenticated) {
        this.sessionRepo.updateSession({
          status: 'authenticated',
          authenticatedAt: new Date(),
        });
      } else if (initResponse.competing) {
        // Another session is active; we've requested to compete
        throw new AuthenticationError(
          'Another session is active. Session competition initiated.',
          'COMPETING_SESSION'
        );
      } else if (initResponse.error) {
        throw new AuthenticationError(
          `Session initialization failed: ${initResponse.error}`,
          'SESSION_INIT_FAILED'
        );
      } else {
        // Connected but not authenticated - likely need web login first
        this.sessionRepo.updateSession({ status: 'disconnected' });
        throw new AuthenticationError(
          'Session not authenticated. Please complete login via the gateway web interface.',
          'SESSION_INIT_FAILED'
        );
      }

      return this.sessionRepo.getSession();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      this.sessionRepo.updateSession({ status: 'disconnected' });
      throw new AuthenticationError(
        `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Checks the current authentication status with the gateway.
   */
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

  /**
   * Initializes the brokerage session.
   * Called after the user has logged in via the web interface.
   */
  private async initializeBrokerageSession(): Promise<SsoInitResponse> {
    // Generate a pseudo-random machine ID for session tracking
    const machineId = this.generateMachineId();
    const mac = this.generateMacAddress();

    const response = await this.client.post<SsoInitResponse>('/v1/api/iserver/auth/ssodh/init', {
      compete: true,
      locale: 'en_US',
      mac,
      machineId,
      username: '-', // Placeholder; actual auth done via web
    });

    return response;
  }

  /**
   * Generates an 8-character alphanumeric machine ID.
   */
  private generateMachineId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generates a MAC-address-like string for session identification.
   */
  private generateMacAddress(): string {
    const hex = '0123456789ABCDEF';
    const pairs: string[] = [];
    for (let i = 0; i < 6; i++) {
      pairs.push(hex.charAt(Math.floor(Math.random() * 16)) + hex.charAt(Math.floor(Math.random() * 16)));
    }
    return pairs.join('-');
  }

  async submitTOTP(_code: string): Promise<Session> {
    // TOTP is handled during web login, not via API
    // This method is a placeholder for future TOTP challenge handling
    this.sessionRepo.updateSession({
      status: 'authenticated',
      authenticatedAt: new Date(),
    });
    return this.sessionRepo.getSession();
  }

  generateTOTP(): string | null {
    if (!this.totpSecret) {
      return null;
    }
    return authenticator.generate(this.totpSecret.secret);
  }

  async heartbeat(): Promise<void> {
    await this.client.post('/v1/api/tickle');
    this.sessionRepo.updateSession({ lastHeartbeat: new Date() });
  }

  async logout(): Promise<void> {
    await this.client.post('/v1/api/logout');
    this.sessionRepo.clearSession();
  }

  isAuthenticated(): boolean {
    return this.sessionRepo.getSession().status === 'authenticated';
  }
}
