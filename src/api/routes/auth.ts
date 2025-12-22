import type { FastifyInstance } from 'fastify';
import type { AuthenticationService, SessionManager } from '../../domain/session';
import { AuthStatusResponseSchema } from '../schemas';

export interface AuthRouteDeps {
  sessionManager: SessionManager;
  authService: AuthenticationService;
  enableAutoAuth: boolean;
}

export async function authRoutes(
  fastify: FastifyInstance,
  deps: AuthRouteDeps
): Promise<void> {
  fastify.get('/auth/status', {
    schema: {
      description: 'Get current authentication status',
      tags: ['Auth'],
      security: [{ basicAuth: [] }],
      response: {
        200: AuthStatusResponseSchema,
      },
    },
  }, async () => {
    const session = deps.sessionManager.getSession();
    const reauthenticating = deps.sessionManager.isReauthenticating();

    return {
      status: session.status,
      authenticated: session.status === 'authenticated',
      reauthenticating,
      authenticatedAt: session.authenticatedAt?.toISOString(),
      expiresAt: session.expiresAt?.toISOString(),
      lastHeartbeat: session.lastHeartbeat?.toISOString(),
      timestamp: new Date().toISOString(),
    };
  });

  // Manual login endpoint - only available when enableAutoAuth is false
  fastify.post<{
    Body: {
      username: string;
      password: string;
      totpSecret?: string;
      paperTrading?: boolean;
    };
  }>('/auth/login', {
    schema: {
      description: deps.enableAutoAuth
        ? 'Manual login (disabled - auto-auth is enabled)'
        : `Authenticate with IBKR Gateway.

IBKR credentials are passed in the request body.`,
      tags: ['Auth'],
      security: [{ basicAuth: [] }],
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: {
            type: 'string',
            description: 'IBKR username',
          },
          password: {
            type: 'string',
            description: 'IBKR password',
          },
          totpSecret: {
            type: 'string',
            description: 'TOTP secret for 2FA (base32 encoded). Required for live trading.',
          },
          paperTrading: {
            type: 'boolean',
            description: 'Enable paper trading mode. No TOTP required for paper trading.',
            default: false,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    // If auto-auth is enabled, manual login is not available
    if (deps.enableAutoAuth) {
      reply.code(400);
      return {
        success: false,
        error: 'Manual login is disabled when auto-auth is enabled',
      };
    }

    const { username, password, totpSecret, paperTrading } = request.body;

    if (!username || !password) {
      reply.code(400);
      return {
        success: false,
        error: 'Username and password are required',
      };
    }

    try {
      // Start session manager with provided credentials
      await deps.sessionManager.start({
        username,
        password,
        totpSecret,
        paperTrading: paperTrading ?? false,
      });

      return { success: true, message: 'Authentication successful' };
    } catch (error) {
      reply.code(401);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  });
}


