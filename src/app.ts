import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { Config } from './config';
import { createAuthMiddleware } from './api/auth-middleware';
import { healthRoutes, accountRoutes, orderRoutes, marketDataRoutes, authRoutes } from './api/routes';
import { IbkrGatewayManager } from './infrastructure/ibkr-gateway-manager';
import { IbkrSessionRepository } from './infrastructure/ibkr-session-repository';
import { IbkrSessionManager } from './infrastructure/ibkr-session-manager';
import { IbkrAuthService } from './infrastructure/ibkr-auth-service';
import { IbkrAccountRepository } from './infrastructure/ibkr-account-repository';
import { IbkrOrderRepository } from './infrastructure/ibkr-order-repository';
import { IbkrMarketDataRepository } from './infrastructure/ibkr-market-data-repository';
import { GatewayClient } from './infrastructure/gateway-client';

export async function createApp(config: Config) {
  const fastify = Fastify({
    logger: true,
    ajv: {
      customOptions: {
        // Allow OpenAPI keywords like 'example' in schemas
        keywords: ['example'],
      },
    },
  });

  // Enable CORS for Swagger UI and browser clients
  await fastify.register(fastifyCors, {
    origin: true, // Allow all origins (configure for production)
  });

  // Register Swagger for OpenAPI documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'IBKR REST Bridge API',
        description: 'RESTful API bridge for Interactive Brokers Client Portal Gateway',
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
            description: 'Basic authentication for API access',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Auth', description: 'Authentication status endpoints' },
        { name: 'Account', description: 'Account information endpoints' },
        { name: 'Orders', description: 'Order management endpoints' },
        { name: 'Market Data', description: 'Market data endpoints' },
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

  // Initialize infrastructure
  const gatewayManager = new IbkrGatewayManager({
    gatewayPath: config.gateway.path,
    configPath: config.gateway.configPath,
    port: config.gateway.port,
  });

  const sessionRepository = new IbkrSessionRepository();

  const gatewayClient = new GatewayClient(
    { baseUrl: gatewayManager.getBaseUrl(), timeout: 30000 },
    gatewayManager
  );

  const authService = new IbkrAuthService(
    gatewayClient,
    sessionRepository,
    config.ibkr.totpSecret ? { secret: config.ibkr.totpSecret } : undefined
  );

  const sessionManager = new IbkrSessionManager(
    authService,
    sessionRepository,
    config.session.heartbeatIntervalMs
  );

  // Wire up gateway client to wait during re-authentication
  gatewayClient.setSessionManager(sessionManager);

  const accountRepository = new IbkrAccountRepository(gatewayClient);
  const orderRepository = new IbkrOrderRepository(gatewayClient);
  const marketDataRepository = new IbkrMarketDataRepository(gatewayClient);

  // Register auth middleware for all routes except health
  const authMiddleware = createAuthMiddleware(config.auth);
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/v1/health') {
      return;
    }
    await authMiddleware(request, reply);
  });

  // Register routes
  await fastify.register(
    async (instance) => {
      await healthRoutes(instance, { gatewayManager, authService });
      await accountRoutes(instance, { accountRepository });
      await orderRoutes(instance, { orderRepository, accountRepository });
      await marketDataRoutes(instance, { marketDataRepository });
      await authRoutes(instance, { sessionManager });
    },
    { prefix: '/api/v1' }
  );

  return { fastify, gatewayManager, sessionManager };
}
