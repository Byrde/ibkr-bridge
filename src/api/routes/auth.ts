import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../../domain/session';

export interface AuthRouteDeps {
  sessionManager: SessionManager;
}

export async function authRoutes(
  fastify: FastifyInstance,
  deps: AuthRouteDeps
): Promise<void> {
  fastify.get('/auth/status', {
    schema: {
      tags: ['Authentication'],
      summary: 'Authentication status',
      description: 'Get the current authentication session status',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['disconnected', 'authenticating', 'awaiting_totp', 'authenticated', 'expired'] },
            authenticated: { type: 'boolean' },
            reauthenticating: { type: 'boolean' },
            authenticatedAt: { type: ['string', 'null'] },
            expiresAt: { type: ['string', 'null'] },
            lastHeartbeat: { type: ['string', 'null'] },
            timestamp: { type: 'string' },
          },
        },
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

