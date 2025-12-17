import type { FastifyInstance } from 'fastify';
import type { GatewayManager } from '../../domain/gateway';
import type { AuthenticationService } from '../../domain/session';

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
      tags: ['Health'],
      summary: 'Health check',
      description: 'Check the health status of the gateway and authentication session',
      security: [],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded'] },
            gateway: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                healthy: { type: 'boolean' },
                pid: { type: ['number', 'null'] },
                startedAt: { type: ['string', 'null'] },
                restartCount: { type: 'number' },
              },
            },
            session: {
              type: 'object',
              properties: {
                authenticated: { type: 'boolean' },
              },
            },
            timestamp: { type: 'string' },
          },
        },
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
