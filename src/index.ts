import { loadConfig } from './config';
import { createApp } from './app';
import type { GatewayManager } from './domain/gateway';

const GATEWAY_READY_TIMEOUT_MS = 120000;
const GATEWAY_READY_POLL_MS = 2000;

async function waitForGatewayReady(gatewayManager: GatewayManager): Promise<void> {
  console.log('Waiting for gateway to become ready...');
  const startTime = Date.now();

  while (Date.now() - startTime < GATEWAY_READY_TIMEOUT_MS) {
    if (await gatewayManager.isHealthy()) {
      console.log('Gateway is ready');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, GATEWAY_READY_POLL_MS));
  }

  throw new Error(`Gateway did not become ready within ${GATEWAY_READY_TIMEOUT_MS}ms`);
}

async function main() {
  const config = loadConfig();
  const { fastify, gatewayManager, sessionManager } = await createApp(config);

  // Start the gateway process
  console.log('Starting IBKR Gateway...');
  try {
    await gatewayManager.start();
  } catch (error) {
    console.error('Failed to start gateway:', error);
    console.log('Continuing without gateway - health checks will report degraded status');
  }

  // Wait for gateway to be ready before starting session manager
  try {
    await waitForGatewayReady(gatewayManager);

    // Start session manager (handles auth + heartbeat + auto re-auth)
    console.log('Starting session manager...');
    await sessionManager.start({
      username: config.ibkr.username,
      password: config.ibkr.password,
      paperTrading: config.ibkr.paperTrading,
    });
    console.log(`Session manager started (paperTrading=${config.ibkr.paperTrading})`);
  } catch (error) {
    console.warn('Session manager failed to start, API will be in degraded mode:', error);
  }

  // Start the API server
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`IBKR REST Bridge listening on ${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);

    try {
      await sessionManager.stop();
      console.log('Session manager stopped');
    } catch (error) {
      console.error('Error stopping session manager:', error);
    }

    try {
      await fastify.close();
      console.log('HTTP server closed');
    } catch (error) {
      console.error('Error closing HTTP server:', error);
    }

    try {
      await gatewayManager.stop();
      console.log('Gateway stopped');
    } catch (error) {
      console.error('Error stopping gateway:', error);
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
