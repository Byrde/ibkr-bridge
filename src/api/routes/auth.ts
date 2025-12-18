import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../../domain/session';
import { AuthStatusResponseSchema } from '../schemas';

export interface AuthRouteDeps {
  sessionManager: SessionManager;
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
}


