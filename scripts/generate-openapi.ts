#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification from Fastify routes.
 * This script creates a minimal Fastify app with Swagger to extract the spec.
 */

import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import * as fs from 'fs';
import * as path from 'path';

// Import route handlers
import { healthRoutes } from '../src/api/routes/health';
import { accountRoutes } from '../src/api/routes/account';
import { orderRoutes } from '../src/api/routes/orders';
import { marketDataRoutes } from '../src/api/routes/market-data';
import { authRoutes } from '../src/api/routes/auth';

async function generateSpec() {
  const fastify = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        // Allow OpenAPI keywords like 'example' in schemas
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

  // Create mock dependencies that satisfy the interfaces
  const mockGatewayManager = {
    isHealthy: async () => true,
    getStatus: () => 'running',
    getProcessInfo: () => ({ pid: null, startedAt: null, restartCount: 0 }),
  };

  const mockSessionManager = {
    getSession: () => ({ status: 'disconnected' as const }),
    isReauthenticating: () => false,
    start: async () => {},
    stop: async () => {},
    waitForReauth: async () => {},
  };

  const mockAuthService = {
    isAuthenticated: () => false,
    login: async () => ({ status: 'authenticated' as const }),
    submitTOTP: async () => ({ status: 'authenticated' as const }),
    checkAuthStatus: async () => ({ connected: false, authenticated: false, competing: false }),
    heartbeat: async () => ({ valid: false }),
    logout: async () => {},
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
      await authRoutes(instance, {
        sessionManager: mockSessionManager as never,
        authService: mockAuthService as never,
        enableAutoAuth: false,
      });
    },
    { prefix: '/api/v1' }
  );

  // Wait for routes to be ready
  await fastify.ready();

  // Generate the OpenAPI spec
  const spec = fastify.swagger();

  // Write to file
  const outputPath = path.join(__dirname, '..', 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n');

  console.log(`OpenAPI specification written to ${outputPath}`);

  await fastify.close();
}

generateSpec().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
