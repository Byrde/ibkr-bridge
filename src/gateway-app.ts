import Fastify from 'fastify';
import fastifyHttpProxy from '@fastify/http-proxy';
import type { GatewayManager } from './domain/gateway';
import { HeadlessLoginService, type LoginCredentials } from './infrastructure/headless-login-service';

export interface GatewayAppConfig {
  gatewayManager: GatewayManager;
}

/**
 * Minimal gateway application that:
 * 1. Provides a login endpoint for headless browser authentication
 * 2. Proxies all other /v1/api/* requests to the IBKR Gateway
 * 3. Provides a simple health check
 */
export async function createGatewayApp(config: GatewayAppConfig) {
  const { gatewayManager } = config;

  const fastify = Fastify({
    logger: true,
  });

  // Health check endpoint
  fastify.get('/api/v1/health', {
    schema: {
      description: 'Gateway health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            gateway: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                healthy: { type: 'boolean' },
                pid: { type: 'number' },
                restartCount: { type: 'number' },
              },
            },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    const gatewayHealthy = await gatewayManager.isHealthy();
    const processInfo = gatewayManager.getProcessInfo();

    return {
      status: gatewayHealthy ? 'healthy' : 'degraded',
      gateway: {
        status: gatewayManager.getStatus(),
        healthy: gatewayHealthy,
        pid: processInfo.pid,
        restartCount: processInfo.restartCount,
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Login endpoint - accepts credentials and performs headless browser login
  fastify.post<{
    Body: {
      username: string;
      password: string;
      totpSecret?: string;
      paperTrading?: boolean;
    };
  }>('/api/v1/auth/login', {
    schema: {
      description: 'Authenticate with IBKR Gateway using headless browser login',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', description: 'IBKR username' },
          password: { type: 'string', description: 'IBKR password' },
          totpSecret: { type: 'string', description: 'TOTP secret for 2FA (base32 encoded)' },
          paperTrading: { type: 'boolean', description: 'Enable paper trading mode', default: false },
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
    const { username, password, totpSecret, paperTrading } = request.body;

    const loginService = new HeadlessLoginService(gatewayManager.getBaseUrl(), {
      headless: true,
      timeout: 60000,
    });

    const credentials: LoginCredentials = {
      username,
      password,
      totpSecret,
      paperTrading,
    };

    const result = await loginService.login(credentials);

    if (result.success) {
      return { success: true, message: 'Authentication successful' };
    }

    reply.code(401);
    return {
      success: false,
      error: result.error ?? 'Authentication failed',
    };
  });

  // Proxy all /v1/api/* requests to the IBKR Gateway
  await fastify.register(fastifyHttpProxy, {
    upstream: gatewayManager.getBaseUrl(),
    prefix: '/v1/api',
    rewritePrefix: '/v1/api',
    http: {
      // Gateway uses self-signed certificates
      requestOptions: {
        rejectUnauthorized: false,
      },
    },
  });

  return fastify;
}
