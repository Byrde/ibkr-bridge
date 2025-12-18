import { IbkrSessionManager } from '../../src/infrastructure/ibkr-session-manager';
import type {
  AuthenticationService,
  SessionRepository,
  Session,
} from '../../src/domain/session';

describe('IbkrSessionManager', () => {
  let mockAuthService: jest.Mocked<AuthenticationService>;
  let mockSessionRepo: jest.Mocked<SessionRepository>;
  let sessionManager: IbkrSessionManager;
  const heartbeatIntervalMs = 100; // Short interval for tests

  beforeEach(() => {
    jest.useFakeTimers();

    mockAuthService = {
      login: jest.fn().mockResolvedValue({ status: 'authenticated' }),
      submitTOTP: jest.fn(),
      checkAuthStatus: jest.fn(),
      heartbeat: jest.fn().mockResolvedValue({ valid: true, competing: false }),
      logout: jest.fn().mockResolvedValue(undefined),
      isAuthenticated: jest.fn().mockReturnValue(true),
    };

    mockSessionRepo = {
      getSession: jest.fn().mockReturnValue({ status: 'authenticated' }),
      updateSession: jest.fn(),
      clearSession: jest.fn(),
    };

    sessionManager = new IbkrSessionManager(
      mockAuthService,
      mockSessionRepo,
      heartbeatIntervalMs
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should authenticate with provided credentials', async () => {
      const credentials = { username: 'testuser', password: 'testpass' };

      await sessionManager.start(credentials);

      expect(mockAuthService.login).toHaveBeenCalledWith(credentials);
    });

    it('should start heartbeat after successful authentication', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });

      // Advance timer to trigger heartbeat
      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve(); // Flush promises

      expect(mockAuthService.heartbeat).toHaveBeenCalled();
    });

    it('should propagate authentication errors', async () => {
      const error = new Error('Auth failed');
      mockAuthService.login.mockRejectedValue(error);

      await expect(
        sessionManager.start({ username: 'test', password: 'test' })
      ).rejects.toThrow('Auth failed');
    });
  });

  describe('stop', () => {
    it('should stop heartbeat and logout', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      await sessionManager.stop();

      // Advance timer - heartbeat should NOT be called after stop
      mockAuthService.heartbeat.mockClear();
      jest.advanceTimersByTime(heartbeatIntervalMs * 2);
      await Promise.resolve();

      expect(mockAuthService.heartbeat).not.toHaveBeenCalled();
      expect(mockAuthService.logout).toHaveBeenCalled();
    });

    it('should reject pending waiters when stopped', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });

      // Simulate re-auth starting
      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });
      mockAuthService.login.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve();

      // Wait for reauth should be pending
      const waitPromise = sessionManager.waitForReauth();

      // Stop the manager
      await sessionManager.stop();

      await expect(waitPromise).rejects.toThrow('Session manager stopped');
    });
  });

  describe('getSession', () => {
    it('should return current session from repository', async () => {
      const expectedSession: Session = {
        status: 'authenticated',
        authenticatedAt: new Date(),
      };
      mockSessionRepo.getSession.mockReturnValue(expectedSession);

      await sessionManager.start({ username: 'test', password: 'test' });
      const session = sessionManager.getSession();

      expect(session).toEqual(expectedSession);
    });
  });

  describe('automatic re-authentication', () => {
    it('should trigger re-auth when heartbeat returns invalid', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });

      // Clear login calls from start
      mockAuthService.login.mockClear();

      // Configure heartbeat to return invalid
      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });

      // Trigger heartbeat
      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve(); // Flush promises
      await Promise.resolve(); // Flush again for re-auth

      expect(mockAuthService.login).toHaveBeenCalledWith({
        username: 'test',
        password: 'test',
      });
    });

    it('should retry re-auth on failure with backoff', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      mockAuthService.login.mockClear();

      // Configure heartbeat to return invalid
      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });

      // Make first login attempt fail
      mockAuthService.login
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({ status: 'authenticated' });

      // Trigger heartbeat
      jest.advanceTimersByTime(heartbeatIntervalMs);
      // Flush promises multiple times for async chain
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // First attempt
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);

      // Wait for backoff and retry (5000 * attempt = 5000 for first retry)
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAuthService.login).toHaveBeenCalledTimes(2);
    });

    it('should not trigger re-auth if already re-authenticating', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      mockAuthService.login.mockClear();

      // Configure heartbeat to return invalid
      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });

      // Make login slow - never resolves during test
      mockAuthService.login.mockImplementation(
        () => new Promise(() => {})
      );

      // Trigger first heartbeat
      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve();

      // Trigger second heartbeat while re-auth is in progress
      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve();

      // Should only have one login call
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
    });
  });

  describe('isReauthenticating', () => {
    it('should return false when not re-authenticating', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      expect(sessionManager.isReauthenticating()).toBe(false);
    });

    it('should return true during re-authentication', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      mockAuthService.login.mockClear();

      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });
      mockAuthService.login.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve();

      expect(sessionManager.isReauthenticating()).toBe(true);
    });
  });

  describe('waitForReauth', () => {
    it('should resolve immediately when not re-authenticating and session is valid', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });

      await expect(sessionManager.waitForReauth()).resolves.toBeUndefined();
    });

    it('should throw when not re-authenticating and session is invalid', async () => {
      mockSessionRepo.getSession.mockReturnValue({ status: 'expired' });
      await sessionManager.start({ username: 'test', password: 'test' });

      await expect(sessionManager.waitForReauth()).rejects.toThrow(
        'Session not authenticated: expired'
      );
    });

    it('should wait and resolve when re-auth succeeds', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      mockAuthService.login.mockClear();

      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });

      let loginResolve: (value: Session) => void;
      mockAuthService.login.mockImplementation(
        () =>
          new Promise((resolve) => {
            loginResolve = resolve;
          })
      );

      // Trigger re-auth
      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve();

      // Start waiting
      const waitPromise = sessionManager.waitForReauth();

      // Resolve re-auth
      loginResolve!({ status: 'authenticated' });
      await Promise.resolve();
      await Promise.resolve();

      await expect(waitPromise).resolves.toBeUndefined();
    });

    it('should wait and reject when re-auth fails', async () => {
      await sessionManager.start({ username: 'test', password: 'test' });
      mockAuthService.login.mockClear();

      mockAuthService.heartbeat.mockResolvedValue({ valid: false, competing: false });
      mockAuthService.login.mockRejectedValue(new Error('Re-auth failed'));

      // Trigger re-auth
      jest.advanceTimersByTime(heartbeatIntervalMs);
      await Promise.resolve();

      const waitPromise = sessionManager.waitForReauth();

      // Wait for all retry attempts to fail
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(5000 * (i + 1)); // Backoff
        await Promise.resolve();
      }

      await expect(waitPromise).rejects.toThrow('Re-auth failed');
    });
  });
});




