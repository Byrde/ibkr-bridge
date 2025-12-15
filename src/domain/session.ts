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
}

export interface SessionRepository {
  getSession(): Session;
  updateSession(session: Partial<Session>): void;
  clearSession(): void;
}

export interface AuthenticationService {
  login(credentials: Credentials): Promise<Session>;
  submitTOTP(code: string): Promise<Session>;
  checkAuthStatus(): Promise<AuthStatusResponse>;
  heartbeat(): Promise<void>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
}
