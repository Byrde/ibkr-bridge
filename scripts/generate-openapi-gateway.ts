#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification for the Gateway API.
 */

import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import * as fs from 'fs';
import * as path from 'path';

async function generateSpec() {
  const fastify = Fastify({
    logger: false,
  });

  // Register Swagger with OpenAPI config
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
        { name: 'Proxy', description: 'Gateway proxy endpoints' },
      ],
    },
  });

  // Register gateway routes inline (mirrors gateway-app.ts)
  await fastify.register(
    async (instance) => {
      // Health check
      instance.get('/health', {
        schema: {
          description: 'Gateway health check',
          tags: ['Health'],
          response: {
            200: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['healthy', 'degraded'], example: 'healthy' },
                gateway: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'running' },
                    healthy: { type: 'boolean', example: true },
                    pid: { type: 'number', example: 12345 },
                    restartCount: { type: 'number', example: 0 },
                  },
                },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      }, async () => ({}));

      // Login endpoint
      instance.post('/auth/login', {
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
                success: { type: 'boolean', example: true },
                message: { type: 'string', example: 'Authentication successful' },
              },
            },
            401: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string', example: 'Authentication failed' },
              },
            },
          },
        },
      }, async () => ({}));
    },
    { prefix: '/api' }
  );

  // Document the proxy behavior
  await fastify.register(
    async (instance) => {
      instance.all('/*', {
        schema: {
          description: 'All requests under /api/gateway/* are proxied directly to the IBKR Client Portal Gateway. Refer to IBKR documentation for available endpoints.',
          tags: ['Proxy'],
        },
      }, async () => ({}));
    },
    { prefix: '/api/gateway' }
  );

  // Wait for routes to be ready
  await fastify.ready();

  // Generate the OpenAPI spec
  const spec = fastify.swagger();

  // Write to file
  const outputPath = path.join(__dirname, '..', 'openapi.gateway.json');
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n');

  console.log(`Gateway OpenAPI specification written to ${outputPath}`);

  await fastify.close();
}

generateSpec().catch((err) => {
  console.error('Failed to generate Gateway OpenAPI spec:', err);
  process.exit(1);
});
