#!/usr/bin/env npx ts-node

/**
 * Test script for the headless login service
 */

import { HeadlessLoginService } from '../src/infrastructure/headless-login-service';
import * as dotenv from 'dotenv';

dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'https://localhost:5001';

async function main() {
  const username = process.env.IBKR_USERNAME;
  const password = process.env.IBKR_PASSWORD;
  const totpSecret = process.env.IBKR_TOTP_SECRET;

  if (!username || !password) {
    console.error('Missing IBKR_USERNAME or IBKR_PASSWORD');
    process.exit(1);
  }

  console.log('=== Headless Login Test ===');
  console.log(`Gateway: ${GATEWAY_URL}`);
  console.log(`User: ${username}`);
  console.log(`TOTP: ${totpSecret ? 'yes' : 'no'}`);
  console.log('');

  const service = new HeadlessLoginService(GATEWAY_URL, {
    headless: false,
    timeout: 60000,
  });

  const result = await service.login({ username, password, totpSecret });

  console.log('');
  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
