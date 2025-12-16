export interface Credentials {
  username: string;
  password: string;
}

export interface TOTPSecret {
  secret: string;
}

export type SessionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'awaiting_totp'
  | 'authenticated'
  | 'expired';

export interface Session {
  status: SessionStatus;
  authenticatedAt?: Date;
  expiresAt?: Date;
  lastHeartbeat?: Date;
}

/**
 * Response from GET /iserver/auth/status
 * Indicates current gateway authentication state.
 */
export interface AuthStatusResponse {
  /** Whether the gateway is connected to IBKR backend */
  connected: boolean;
  /** Whether the session is authenticated for trading */
  authenticated: boolean;
  /** Whether authentication is in a competing state */
  competing: boolean;
  /** Error message if authentication failed */
  fail?: string;
  /** Additional message from gateway */
  message?: string;
}

/**
 * Response from POST /iserver/auth/ssodh/init
 * Used to initialize brokerage session after web login.
 */
export interface SsoInitResponse {
  /** Whether the session was successfully initialized */
  authenticated?: boolean;
  /** Whether there's a competing session */
  competing?: boolean;
  /** Whether the session is connected */
  connected?: boolean;
  /** Error message if initialization failed */
  error?: string;
  /** Authentication challenge (hex string) if additional auth required */
  challenge?: string;
  /** Prompt type (e.g., '2fa' for TOTP challenge) */
  prompts?: string[];
}

/**
 * Response from POST /iserver/auth/ssodh/init when submitting 2FA response.
 */
export interface TotpChallengeResponse {
  /** Whether the challenge was successfully completed */
  authenticated?: boolean;
  /** Whether there's an error */
  error?: string;
  /** Additional message */
  message?: string;
}

/**
 * Response from POST /tickle
 * Used to keep the session alive and check session validity.
 */
export interface TickleResponse {
  /** Session ID */
  session?: string;
  /** SSO session expiration timestamp (milliseconds since epoch) */
  ssoExpires?: number;
  /** Collission flag (another session may be competing) */
  collission?: boolean;
  /** User ID */
  userId?: number;
  /** Whether the session is valid for trading */
  iserver?: {
    authStatus?: {
      authenticated?: boolean;
      competing?: boolean;
      connected?: boolean;
    };
  };
}

export interface SessionRepository {
  getSession(): Session;
  updateSession(session: Partial<Session>): void;
  clearSession(): void;
}

/**
 * Result of a heartbeat operation.
 */
export interface HeartbeatResult {
  /** Whether the session is still valid */
  valid: boolean;
  /** When the SSO session expires (if known) */
  ssoExpires?: Date;
  /** Whether there's a competing session */
  competing?: boolean;
}

export interface AuthenticationService {
  login(credentials: Credentials): Promise<Session>;
  submitTOTP(code: string): Promise<Session>;
  checkAuthStatus(): Promise<AuthStatusResponse>;
  heartbeat(): Promise<HeartbeatResult>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
}
