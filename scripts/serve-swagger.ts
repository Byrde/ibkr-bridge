#!/usr/bin/env tsx
/**
 * Serve Swagger UI without requiring full app configuration.
 * Useful for viewing API documentation locally.
 */

import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

// Import route handlers
import { healthRoutes } from '../src/api/routes/health';
import { accountRoutes } from '../src/api/routes/account';
import { orderRoutes } from '../src/api/routes/orders';
import { marketDataRoutes } from '../src/api/routes/market-data';
import { authRoutes } from '../src/api/routes/auth';

async function serve() {
  const fastify = Fastify({
    logger: true,
    ajv: {
      customOptions: {
        keywords: ['example'],
      },
    },
  });

  // Register Swagger with OpenAPI config
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

  // Create mock dependencies
  const mockGatewayManager = {
    isHealthy: async () => true,
    getStatus: () => 'running',
    getProcessInfo: () => ({ pid: null, startedAt: null, restartCount: 0 }),
  };

  const mockAuthService = {
    isAuthenticated: () => false,
  };

  const mockSessionManager = {
    getSession: () => ({ status: 'disconnected' as const }),
    isReauthenticating: () => false,
  };

  const mockAccountRepository = {
    getAccounts: async () => [],
    getAccount: async () => null,
    getPositions: async () => [],
  };

  const mockOrderRepository = {
    getOrders: async () => [],
    getOrder: async () => null,
    placeOrder: async () => ({} as never),
    modifyOrder: async () => ({} as never),
    cancelOrder: async () => {},
  };

  const mockMarketDataRepository = {
    searchInstruments: async () => [],
    getQuote: async () => null,
    getQuotes: async () => [],
  };

  // Register routes with mock dependencies
  await fastify.register(
    async (instance) => {
      await healthRoutes(instance, {
        gatewayManager: mockGatewayManager as never,
        authService: mockAuthService as never,
      });
      await accountRoutes(instance, { accountRepository: mockAccountRepository });
      await orderRoutes(instance, {
        orderRepository: mockOrderRepository,
        accountRepository: mockAccountRepository,
      });
      await marketDataRoutes(instance, { marketDataRepository: mockMarketDataRepository });
      await authRoutes(instance, { sessionManager: mockSessionManager as never });
    },
    { prefix: '/api/v1' }
  );

  // Start server
  const port = 3000;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Swagger UI available at http://localhost:${port}/docs`);
}

serve().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

