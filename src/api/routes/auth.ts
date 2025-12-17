import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../../domain/session';

export interface AuthRouteDeps {
  sessionManager: SessionManager;
}

export async function authRoutes(
  fastify: FastifyInstance,
  deps: AuthRouteDeps
): Promise<void> {
  fastify.get('/auth/status', async () => {
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

