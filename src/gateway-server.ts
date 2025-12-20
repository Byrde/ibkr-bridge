import { createGatewayApp } from './gateway-app';
import { IbkrGatewayManager } from './infrastructure/ibkr-gateway-manager';

const GATEWAY_READY_TIMEOUT_MS = 120000;
const GATEWAY_READY_POLL_MS = 2000;

interface GatewayConfig {
  port: number;
  host: string;
  gateway: {
    path: string;
    configPath: string;
    port: number;
  };
}

function loadConfig(): GatewayConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    gateway: {
      path: process.env.GATEWAY_PATH ?? '/opt/ibkr/clientportal.gw',
      configPath: process.env.GATEWAY_CONFIG_PATH ?? '/opt/ibkr/root/conf.yaml',
      port: parseInt(process.env.GATEWAY_PORT ?? '5000', 10),
    },
  };
}

async function waitForGatewayReady(gatewayManager: IbkrGatewayManager): Promise<void> {
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

  // Initialize gateway manager
  const gatewayManager = new IbkrGatewayManager({
    gatewayPath: config.gateway.path,
    configPath: config.gateway.configPath,
    port: config.gateway.port,
  });

  // Start the gateway process
  console.log('Starting IBKR Gateway...');
  try {
    await gatewayManager.start();
  } catch (error) {
    console.error('Failed to start gateway:', error);
    console.log('Continuing without gateway - health checks will report degraded status');
  }

  // Wait for gateway to be ready
  try {
    await waitForGatewayReady(gatewayManager);
  } catch (error) {
    console.warn('Gateway not ready, continuing anyway:', error);
  }

  // Create and start the gateway app
  const fastify = await createGatewayApp({ gatewayManager });

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`IBKR Gateway Server listening on ${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);

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
