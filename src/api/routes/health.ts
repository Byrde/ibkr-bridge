import type { FastifyInstance } from 'fastify';
import type { GatewayManager } from '../../domain/gateway';
import type { AuthenticationService } from '../../domain/session';
import { HealthResponseSchema } from '../schemas';

export interface HealthRouteDeps {
  gatewayManager: GatewayManager;
  authService: AuthenticationService;
}

export async function healthRoutes(
  fastify: FastifyInstance,
  deps: HealthRouteDeps
): Promise<void> {
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint for the IBKR bridge',
      tags: ['Health'],
      response: {
        200: HealthResponseSchema,
      },
    },
  }, async () => {
    const gatewayHealthy = await deps.gatewayManager.isHealthy();
    const sessionAuthenticated = deps.authService.isAuthenticated();
    const processInfo = deps.gatewayManager.getProcessInfo();

    return {
      status: gatewayHealthy && sessionAuthenticated ? 'healthy' : 'degraded',
      gateway: {
        status: deps.gatewayManager.getStatus(),
        healthy: gatewayHealthy,
        pid: processInfo.pid,
        startedAt: processInfo.startedAt?.toISOString(),
        restartCount: processInfo.restartCount,
      },
      session: {
        authenticated: sessionAuthenticated,
      },
      timestamp: new Date().toISOString(),
    };
  });
}
