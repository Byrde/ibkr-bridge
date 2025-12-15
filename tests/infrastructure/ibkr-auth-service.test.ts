import { IbkrAuthService, AuthenticationError } from '../../src/infrastructure/ibkr-auth-service';
import type { GatewayClient } from '../../src/infrastructure/gateway-client';
import type { SessionRepository, AuthStatusResponse, SsoInitResponse } from '../../src/domain/session';

describe('IbkrAuthService', () => {
  let mockClient: jest.Mocked<GatewayClient>;
  let mockSessionRepo: jest.Mocked<SessionRepository>;
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

    authService = new IbkrAuthService(mockClient, mockSessionRepo);
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
    });

    it('should initialize session when connected but not authenticated', async () => {
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

    it('should throw NOT_CONNECTED error when gateway is not connected', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: false,
        authenticated: false,
        competing: false,
      };
      mockClient.get.mockResolvedValue(statusResponse);

      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toThrow(
        AuthenticationError
      );
      await expect(authService.login({ username: 'test', password: 'test' })).rejects.toMatchObject({
        code: 'NOT_CONNECTED',
      });
    });

    it('should throw COMPETING_SESSION error when session is competing', async () => {
      const statusResponse: AuthStatusResponse = {
        connected: true,
        authenticated: false,
        competing: false,
      };
      const initResponse: SsoInitResponse = {
        authenticated: false,
        competing: true,
      };

      mockClient.get.mockResolvedValue(statusResponse);
      mockClient.post.mockResolvedValue(initResponse);

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
    it('should call tickle endpoint and update session', async () => {
      mockClient.post.mockResolvedValue({});

      await authService.heartbeat();

      expect(mockClient.post).toHaveBeenCalledWith('/v1/api/tickle');
      expect(mockSessionRepo.updateSession).toHaveBeenCalledWith({
        lastHeartbeat: expect.any(Date),
      });
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
      const authServiceWithTotp = new IbkrAuthService(mockClient, mockSessionRepo, {
        secret: 'JBSWY3DPEHPK3PXP', // Test secret
      });

      const totp = authServiceWithTotp.generateTOTP();

      expect(totp).toBeDefined();
      expect(totp).toHaveLength(6);
      expect(/^\d{6}$/.test(totp!)).toBe(true);
    });
  });
});
