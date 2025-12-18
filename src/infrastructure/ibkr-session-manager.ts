import type {
  AuthenticationService,
  Credentials,
  Session,
  SessionManager,
  SessionRepository,
} from '../domain/session';
import { createLogger } from './logger';

const log = createLogger('SessionManager');

const MAX_REAUTH_ATTEMPTS = 3;
const REAUTH_BACKOFF_MS = 5000;

/**
 * Manages IBKR session lifecycle with automatic re-authentication.
 *
 * Features:
 * - Stores credentials for re-authentication
 * - Monitors session via periodic heartbeat
 * - Triggers re-auth when session expires
 * - Provides wait mechanism for in-flight requests during re-auth
 */
export class IbkrSessionManager implements SessionManager {
  private credentials: Credentials | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reauthenticating = false;
  private reauthPromise: Promise<void> | null = null;
  private reauthResolvers: { resolve: () => void; reject: (err: Error) => void }[] = [];
  private stopped = false;

  constructor(
    private readonly authService: AuthenticationService,
    private readonly sessionRepo: SessionRepository,
    private readonly heartbeatIntervalMs: number
  ) {}

  async start(credentials: Credentials): Promise<void> {
    this.credentials = credentials;
    this.stopped = false;

    log.info('Starting session manager');

    // Perform initial authentication
    await this.authService.login(credentials);

    // Start heartbeat monitoring
    this.startHeartbeat();

    log.info('Session manager started');
  }

  async stop(): Promise<void> {
    log.info('Stopping session manager');
    this.stopped = true;
    this.stopHeartbeat();

    // Reject any pending re-auth waiters
    const error = new Error('Session manager stopped');
    for (const { reject } of this.reauthResolvers) {
      reject(error);
    }
    this.reauthResolvers = [];

    try {
      await this.authService.logout();
    } catch (err) {
      log.warn('Logout failed during stop', err instanceof Error ? err.message : String(err));
    }

    log.info('Session manager stopped');
  }

  getSession(): Session {
    return this.sessionRepo.getSession();
  }

  isReauthenticating(): boolean {
    return this.reauthenticating;
  }

  async waitForReauth(): Promise<void> {
    if (!this.reauthenticating) {
      // Not re-authenticating, check if session is valid
      const session = this.getSession();
      if (session.status === 'authenticated') {
        return;
      }
      throw new Error(`Session not authenticated: ${session.status}`);
    }

    // Wait for the ongoing re-auth to complete
    return new Promise((resolve, reject) => {
      this.reauthResolvers.push({ resolve, reject });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.stopped || this.reauthenticating) {
        return;
      }

      try {
        const result = await this.authService.heartbeat();

        if (!result.valid) {
          log.warn('Session invalid, triggering re-authentication');
          await this.triggerReauth();
        }
      } catch (err) {
        log.error('Heartbeat error', err instanceof Error ? err.message : String(err));
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async triggerReauth(): Promise<void> {
    if (this.reauthenticating || this.stopped) {
      return;
    }

    if (!this.credentials) {
      log.error('Cannot re-authenticate: no credentials stored');
      return;
    }

    this.reauthenticating = true;
    log.info('Starting re-authentication');

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_REAUTH_ATTEMPTS; attempt++) {
      if (this.stopped) {
        break;
      }

      try {
        log.info(`Re-authentication attempt ${attempt}/${MAX_REAUTH_ATTEMPTS}`);
        await this.authService.login(this.credentials);

        // Success - resolve all waiters
        log.info('Re-authentication successful');
        this.reauthenticating = false;

        for (const { resolve } of this.reauthResolvers) {
          resolve();
        }
        this.reauthResolvers = [];

        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.error(
          `Re-authentication attempt ${attempt} failed`,
          lastError.message
        );

        if (attempt < MAX_REAUTH_ATTEMPTS && !this.stopped) {
          const backoff = REAUTH_BACKOFF_MS * attempt;
          log.info(`Waiting ${backoff}ms before retry`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    // All attempts failed
    log.error('Re-authentication failed after all attempts');
    this.reauthenticating = false;

    const error = lastError ?? new Error('Re-authentication failed');
    for (const { reject } of this.reauthResolvers) {
      reject(error);
    }
    this.reauthResolvers = [];
  }
}






