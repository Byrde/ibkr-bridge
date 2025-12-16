import { IbkrAuthService, AuthenticationError, HeadlessLoginProvider } from '../../src/infrastructure/ibkr-auth-service';
import type { GatewayClient } from '../../src/infrastructure/gateway-client';
import type {
  SessionRepository,
  AuthStatusResponse,
  SsoInitResponse,
  TotpChallengeResponse,
  TickleResponse,
} from '../../src/domain/session';

describe('IbkrAuthService', () => {
  let mockClient: jest.Mocked<GatewayClient>;
  let mockSessionRepo: jest.Mocked<SessionRepository>;
  let mockHeadlessLogin: jest.Mocked<HeadlessLoginProvider>;
  let authService: IbkrAuthService;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      getBaseUrl: jest.fn().mockReturnValue('https://localhost:5000'),
    } as unknown as jest.Mocked<GatewayClient>;

    mockSessionRepo = {
      getSession: jest.fn().mockReturnValue({ status: 'disconnected' }),
      updateSession: jest.fn(),
      clearSession: jest.fn(),
    };

    mockHeadlessLogin = {
      login: jest.fn().mockResolvedValue({ success: true }),
    };

    authService = new IbkrAuthService(mockClient, mockSessionRepo, undefined, mockHeadlessLogin);
  });

  describe('login', () => {
    it('should authenticate when gateway reports authenticated status', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: true,
        competing: false,
      };
      mockClient.get.mockResolvedValue(statusResponse);

      await authService.login({ username: 'test', password: 'test' });

      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({ status: 'authenticating' });
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'authenticated',
          authenticatedAt: expect.any(Date),
        })
      );
      // Should not call headless login when already authenticated
      expect(mockHeadlessLogin.login).not.toHaveBeenCalled();
    });

    it('should use headless login and initialize session when not authenticated', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: false,
      };
      const initResponse: SsoInitResponse = {
        authenticated: true,
        connected: true,
        competing: false,
      };

      mockClient.get.mockResolvedValue(statusResponse);
      mockClient.post.mockResolvedValue(initResponse);

      await authService.login({ username: 'test', password: 'test' });

      expect(mockHeadlessLogin.login).toHaveBeenCalledWith({
        username: 'test',
        password: 'test',
        totpSecret: undefined,
      });
      expect(mockClient.post).toHaveBeenCalledWith(
        '/v1/api/iserver/auth/ssodh/init',
        expect.objectContaining({
          compete: true,
          locale: 'en_US',
          username: '-',
        })
      );
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'authenticated' })
      );
    });

    it('should throw HEADLESS_LOGIN_FAILED when headless login fails', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: false,
        authenticated: false,
        competing: false,
      };
      mockClient.get.mockResolvedValue(statusResponse);
      mockHeadlessLogin.login.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toThrow(
        AuthenticationError
      );
      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toMatchObject({
        code: 'HEADLESS_LOGIN_FAILED',
      });
    });

    it('should throw TOTP_REQUIRED when headless login requires manual intervention', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: false,
        authenticated: false,
        competing: false,
      };
      mockClient.get.mockResolvedValue(statusResponse);
      mockHeadlessLogin.login.mockResolvedValue({
        success: false,
        error: 'IB Key 2FA requires manual intervention',
        requiresManualIntervention: true,
      });

      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toMatchObject({
        code: 'TOTP_REQUIRED',
      });
    });

    it('should throw COMPETING_SESSION error when session is competing', async () => {
      // First call: initial status check fails (expected when not logged in)
      // Second call: after headless login, status shows competing
      const competingStatusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: true,
      };

      mockClient.get.mockResolvedValue(competingStatusResponse);

      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toThrow(
        AuthenticationError
      );
      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toMatchObject({
        code: 'COMPETING_SESSION',
      });
    });

    it('should throw SESSION_INIT_FAILED when init returns error', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: false,
      };
      const initResponse: SsoInitResponse = {
        authenticated: false,
        error: 'Session expired',
      };

      mockClient.get.mockResolvedValue(statusResponse);
      mockClient.post.mockResolvedValue(initResponse);

      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toThrow(
        AuthenticationError
      );
      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toMatchObject({
        code: 'SESSION_INIT_FAILED',
      });
    });
  });

  describe('checkAuthStatus', () => {
    it('should return auth status from gateway', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: true,
        competing: false,
        message: 'Session active',
      };
      mockClient.get.mockResolvedValue(statusResponse);

      const result = await authService.checkAuthStatus();

      expect(mockClient.get).toHaveBeenCalledWith('/v1/api/iserver/auth/status');
      expect(result).toEqual({
        connected: true,
        authenticated: true,
        competing: false,
        message: 'Session active',
        fail: undefined,
      });
    });

    it('should default missing fields to false', async () => {
      mockClient.get.mockResolvedValue({});

      const result = await authService.checkAuthStatus();

      expect(result).toEqual({
        connected: false,
        authenticated: false,
        competing: false,
        fail: undefined,
        message: undefined,
      });
    });
  });

  describe('heartbeat', () => {
    it('should call tickle endpoint and update session on success', async () => {
      const tickleResponse: TickleResponse = {
        session: 'abc123',
        ssoExpires: Date.now() + 3600000, // 1 hour from now
        iserver: {
          authStatus: {
            authenticated: true,
            competing: false,
            connected: true,
          },
        },
      };
      mockClient.post.mockResolvedValue(tickleResponse);

      const result = await authService.heartbeat();

      expect(mockClient.post).toHaveBeenCalledWith('/v1/api/tickle');
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({
        lastHeartbeat: expect.any(Date),
      });
      expect(result.valid).toBe(true);
      expect(result.ssoExpires).toBeInstanceOf(Date);
      expect(result.competing).toBe(false);
    });

    it('should return valid=true when response has no iserver status (assume valid)', async () => {
      const tickleResponse: TickleResponse = {
        session: 'abc123',
      };
      mockClient.post.mockResolvedValue(tickleResponse);

      const result = await authService.heartbeat();

      expect(result.valid).toBe(true);
    });

    it('should detect session expiry when ssoExpires is in the past', async () => {
      const tickleResponse: TickleResponse = {
        session: 'abc123',
        ssoExpires: Date.now() - 1000, // 1 second ago
        iserver: {
          authStatus: {
            authenticated: true,
            competing: false,
            connected: true,
          },
        },
      };
      mockClient.post.mockResolvedValue(tickleResponse);

      const result = await authService.heartbeat();

      expect(result.valid).toBe(false);
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({ status: 'expired' });
    });

    it('should detect session expiry when not authenticated', async () => {
      const tickleResponse: TickleResponse = {
        session: 'abc123',
        iserver: {
          authStatus: {
            authenticated: false,
            competing: false,
            connected: true,
          },
        },
      };
      mockClient.post.mockResolvedValue(tickleResponse);

      const result = await authService.heartbeat();

      expect(result.valid).toBe(false);
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({ status: 'expired' });
    });

    it('should detect competing session via iserver status', async () => {
      const tickleResponse: TickleResponse = {
        session: 'abc123',
        ssoExpires: Date.now() + 3600000,
        iserver: {
          authStatus: {
            authenticated: true,
            competing: true,
            connected: true,
          },
        },
      };
      mockClient.post.mockResolvedValue(tickleResponse);

      const result = await authService.heartbeat();

      expect(result.valid).toBe(true);
      expect(result.competing).toBe(true);
    });

    it('should detect competing session via collission flag', async () => {
      const tickleResponse: TickleResponse = {
        session: 'abc123',
        collission: true,
      };
      mockClient.post.mockResolvedValue(tickleResponse);

      const result = await authService.heartbeat();

      expect(result.competing).toBe(true);
    });

    it('should handle tickle endpoint failure gracefully', async () => {
      mockClient.post.mockRejectedValue(new Error('Network error'));

      const result = await authService.heartbeat();

      expect(result.valid).toBe(false);
      // Should still update lastHeartbeat to track the attempt
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({
        lastHeartbeat: expect.any(Date),
      });
      // Should NOT mark session as expired on network failure
      expect(mockSessionRepo.updateSession).not.toHaveBeenCalledWith({ status: 'expired' });
    });
  });

  describe('logout', () => {
    it('should call logout endpoint and clear session', async () => {
      mockClient.post.mockResolvedValue({});

      await authService.logout();

      expect(mockClient.post).toHaveBeenCalledWith('/v1/api/logout');
      expect(mockSessionRepo.clearSession).toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when session is authenticated', () => {
      mockSessionRepo.getSession.mockReturnValue({
        status: 'authenticated',
        authenticatedAt: new Date(),
      });

      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false when session is not authenticated', () => {
      mockSessionRepo.getSession.mockReturnValue({ status: 'disconnected' });

      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('generateTOTP', () => {
    it('should return null when no TOTP secret configured', () => {
      expect(authService.generateTOTP()).toBeNull();
    });

    it('should generate TOTP when secret is configured', () => {
      const authServiceWithTotp = new IbkrAuthService(
        mockClient,
        mockSessionRepo,
        { secret: 'JBSWY3DPEHPK3PXP' },
        mockHeadlessLogin
      );

      const totp = authServiceWithTotp.generateTOTP();

      expect(totp).toBeDefined();
      expect(totp).toHaveLength(6);
      expect(/^\d{6}$/.test(totp!)).toBe(true);
    });
  });

  describe('TOTP challenge handling', () => {
    it('should handle TOTP challenge automatically during login when secret is configured', async () => {
      const authServiceWithTotp = new IbkrAuthService(
        mockClient,
        mockSessionRepo,
        { secret: 'JBSWY3DPEHPK3PXP' },
        mockHeadlessLogin
      );

      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: false,
      };
      const initChallengeResponse: SsoInitResponse = {
        authenticated: false,
        challenge: 'deadbeef01234567', // Hex challenge
      };
      const initAuthenticatedResponse: TotpChallengeResponse = {
        authenticated: true,
      };

      mockClient.get.mockResolvedValue(statusResponse);
      mockClient.post
        .mockResolvedValueOnce(initChallengeResponse)
        .mockResolvedValueOnce(initAuthenticatedResponse);

      await authServiceWithTotp.login({ username: 'test', password: 'test' });

      expect(mockHeadlessLogin.login).toHaveBeenCalledWith({
        username: 'test',
        password: 'test',
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({ status: 'awaiting_totp' });
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'authenticated' })
      );
      // Verify TOTP response was submitted
      expect(mockClient.post).toHaveBeenCalledTimes(2);
      expect(mockClient.post).toHaveBeenLastCalledWith(
        '/v1/api/iserver/auth/ssodh/init',
        expect.objectContaining({ response: expect.any(String) })
      );
    });

    it('should throw TOTP_REQUIRED when API challenge received without secret configured', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: false,
      };
      const initChallengeResponse: SsoInitResponse = {
        authenticated: false,
        challenge: 'deadbeef01234567',
      };

      mockClient.get.mockResolvedValue(statusResponse);
      mockClient.post.mockResolvedValue(initChallengeResponse);

      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toMatchObject({
        code: 'TOTP_REQUIRED',
      });
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({ status: 'awaiting_totp' });
    });

    it('should throw TOTP_FAILED when challenge response is rejected', async () => {
      const authServiceWithTotp = new IbkrAuthService(
        mockClient,
        mockSessionRepo,
        { secret: 'JBSWY3DPEHPK3PXP' },
        mockHeadlessLogin
      );

      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: false,
      };
      const initChallengeResponse: SsoInitResponse = {
        authenticated: false,
        challenge: 'deadbeef01234567',
      };
      const failedResponse: TotpChallengeResponse = {
        authenticated: false,
        error: 'Invalid response',
      };

      mockClient.get.mockResolvedValue(statusResponse);
      mockClient.post
        .mockResolvedValueOnce(initChallengeResponse)
        .mockResolvedValueOnce(failedResponse);

      await expect(
        authServiceWithTotp.login({ username: 'test', password: 'test' })
      ).rejects.toMatchObject({
        code: 'TOTP_FAILED',
      });
    });
  });

  describe('computeTotpResponse', () => {
    it('should compute HMAC-SHA1 response from challenge and TOTP code', () => {
      const challenge = 'deadbeef';
      const totpCode = '123456';

      const response = authService.computeTotpResponse(challenge, totpCode);

      // Verify it's a valid hex string of SHA1 length (40 chars)
      expect(response).toMatch(/^[0-9a-f]{40}$/);
    });

    it('should produce different responses for different challenges', () => {
      const totpCode = '123456';

      const response1 = authService.computeTotpResponse('deadbeef', totpCode);
      const response2 = authService.computeTotpResponse('cafebabe', totpCode);

      expect(response1).not.toEqual(response2);
    });
  });
});
