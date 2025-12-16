#!/usr/bin/env npx ts-node

/**
 * Test the heartbeat functionality against a running gateway.
 * Run with: npx ts-node scripts/test-heartbeat.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'https://localhost:5001';

async function main() {
  console.log(`Testing heartbeat against gateway at ${GATEWAY_URL}`);
  console.log('---');

  // First check auth status
  const statusRes = await fetch(`${GATEWAY_URL}/v1/api/iserver/auth/status`, {
    method: 'GET',
    // @ts-ignore - Node 18+ supports this
    dispatcher: new (await import('undici')).Agent({
      connect: { rejectUnauthorized: false }
    })
  });
  
  if (!statusRes.ok) {
    console.error('Auth status check failed:', statusRes.status);
    return;
  }

  const status = await statusRes.json();
  console.log('Auth status:', JSON.stringify(status, null, 2));
  console.log('---');

  // Now test tickle
  const tickleRes = await fetch(`${GATEWAY_URL}/v1/api/tickle`, {
    method: 'GET',
    // @ts-ignore
    dispatcher: new (await import('undici')).Agent({
      connect: { rejectUnauthorized: false }
    })
  });

  if (!tickleRes.ok) {
    console.error('Tickle failed:', tickleRes.status);
    return;
  }

  const tickle = await tickleRes.json();
  console.log('Tickle response:', JSON.stringify(tickle, null, 2));
  console.log('---');

  // Analyze the response
  const ssoExpiresSeconds = tickle.ssoExpires;
  const ssoExpiresDate = ssoExpiresSeconds 
    ? new Date(Date.now() + ssoExpiresSeconds * 1000)
    : null;

  console.log('Analysis:');
  console.log(`  Session ID: ${tickle.session}`);
  console.log(`  User ID: ${tickle.userId}`);
  console.log(`  Authenticated: ${tickle.iserver?.authStatus?.authenticated}`);
  console.log(`  Competing: ${tickle.iserver?.authStatus?.competing || tickle.collission}`);
  console.log(`  SSO Expires in: ${ssoExpiresSeconds} seconds (${Math.round(ssoExpiresSeconds / 3600)} hours)`);
  console.log(`  SSO Expires at: ${ssoExpiresDate?.toISOString()}`);
}

main().catch(console.error);

