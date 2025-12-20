import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
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

  // Enable CORS for Swagger UI and browser clients
  await fastify.register(fastifyCors, {
    origin: true, // Allow all origins (configure for production)
  });

  // Register Swagger for OpenAPI documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'IBKR Gateway API',
        description: 'Minimal API for IBKR Client Portal Gateway authentication and request proxying',
        version: '0.1.0',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development server',
        },
      ],
      components: {
        securitySchemes: {
          basicAuth: {
            type: 'http',
            scheme: 'basic',
            description: 'IBKR credentials (username:password)',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Auth', description: 'Authentication endpoints' },
      ],
    },
  });

  // Register Swagger UI
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health check endpoint
  fastify.get('/api/v1/health', {
    schema: {
      description: 'Gateway health check',
      tags: ['Health'],
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

  // Login endpoint - accepts Basic Auth credentials and performs headless browser login
  fastify.post<{
    Headers: {
      authorization?: string;
      'x-totp-secret'?: string;
      'x-paper-trading'?: string;
    };
  }>('/api/v1/auth/login', {
    schema: {
      description: `Authenticate with IBKR Gateway using headless browser login.

IBKR credentials are passed via Basic Auth. Use the **Authorize** button to set credentials.

**Headers:**
- \`Authorization\`: Basic Auth with IBKR username:password (required)
- \`X-TOTP-Secret\`: TOTP secret for 2FA, base32 encoded (required for live trading)
- \`X-Paper-Trading\`: Set to "true" for paper trading mode (optional)`,
      tags: ['Auth'],
      security: [{ basicAuth: [] }],
      headers: {
        type: 'object',
        properties: {
          'x-totp-secret': {
            type: 'string',
            description: 'TOTP secret for 2FA (base32 encoded). Required for live trading.',
          },
          'x-paper-trading': {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Enable paper trading mode. No TOTP required for paper trading.',
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
    const authHeader = request.headers.authorization;
    const totpSecret = request.headers['x-totp-secret'];
    const paperTrading = request.headers['x-paper-trading'] === 'true';

    // Parse Basic Auth header
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      reply.code(401);
      return {
        success: false,
        error: 'Missing or invalid Authorization header. Expected: Basic base64(username:password)',
      };
    }

    let username: string;
    let password: string;
    try {
      const base64Credentials = authHeader.slice(6); // Remove 'Basic '
      const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) {
        throw new Error('Invalid format');
      }
      username = decoded.slice(0, colonIndex);
      password = decoded.slice(colonIndex + 1);
    } catch {
      reply.code(401);
      return {
        success: false,
        error: 'Invalid Basic Auth encoding. Expected: Basic base64(username:password)',
      };
    }

    if (!username || !password) {
      reply.code(401);
      return {
        success: false,
        error: 'Username and password are required',
      };
    }

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
