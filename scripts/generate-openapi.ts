#!/usr/bin/env tsx

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { createApp } from '../src/app';

// Mock config for generating OpenAPI spec
const mockConfig = {
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  auth: {
    username: 'admin',
    password: 'password',
  },
  ibkr: {
    username: 'mock',
    password: 'mock',
    totpSecret: undefined,
    paperTrading: false,
  },
  gateway: {
    path: '/opt/ibkr/clientportal.gw',
    configPath: '/opt/ibkr/root/conf.yaml',
    port: 5000,
  },
  session: {
    heartbeatIntervalMs: 60000,
  },
};

async function generateOpenAPI() {
  console.log('Generating OpenAPI specification...');

  const { fastify } = await createApp(mockConfig);

  await fastify.ready();

  // Get the OpenAPI object
  const openapi = fastify.swagger();

  // Write to file
  const outputPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(openapi, null, 2) + '\n');

  console.log(`✓ OpenAPI specification written to ${outputPath}`);

  await fastify.close();
  process.exit(0);
}

generateOpenAPI().catch((error) => {
  console.error('Failed to generate OpenAPI specification:', error);
  process.exit(1);
});
