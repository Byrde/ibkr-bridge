#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs';
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

async function validateOpenAPI() {
  console.log('Validating OpenAPI specification...');

  const { fastify } = await createApp(mockConfig);

  await fastify.ready();

  // Get the OpenAPI object
  const generatedSpec = fastify.swagger();
  const generatedJSON = JSON.stringify(generatedSpec, null, 2) + '\n';

  // Read the checked-in file
  const specPath = resolve(process.cwd(), 'openapi.json');
  let checkedInJSON: string;

  try {
    checkedInJSON = readFileSync(specPath, 'utf-8');
  } catch (error) {
    console.error('✗ openapi.json not found in repository');
    console.error('  Run: npm run generate:openapi');
    await fastify.close();
    process.exit(1);
  }

  // Compare
  if (generatedJSON !== checkedInJSON) {
    console.error('✗ OpenAPI specification is out of date!');
    console.error('  The checked-in openapi.json does not match the current code.');
    console.error('  Run: npm run generate:openapi');
    console.error('  Then commit the updated openapi.json file.');

    // Optionally write a diff file for debugging
    const diffPath = resolve(process.cwd(), 'openapi.generated.json');
    writeFileSync(diffPath, generatedJSON);
    console.error(`  Generated spec written to ${diffPath} for comparison.`);

    await fastify.close();
    process.exit(1);
  }

  console.log('✓ OpenAPI specification is up to date');

  await fastify.close();
  process.exit(0);
}

validateOpenAPI().catch((error) => {
  console.error('Failed to validate OpenAPI specification:', error);
  process.exit(1);
});
