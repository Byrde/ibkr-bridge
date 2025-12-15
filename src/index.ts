import { loadConfig } from './config';
import { createApp } from './app';
import type { GatewayManager } from './domain/gateway';
import type { AuthenticationService } from './domain/session';

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

async function attemptAuthentication(
  authService: AuthenticationService,
  username: string,
  password: string
): Promise<boolean> {
  try {
    console.log('Authenticating with IBKR...');
    await authService.login({ username, password });
    console.log('Authentication successful');
    return true;
  } catch (error) {
    console.error('Authentication failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  const config = loadConfig();
  const { fastify, gatewayManager, authService } = await createApp(config);

  // Start the gateway process
  console.log('Starting IBKR Gateway...');
  try {
    await gatewayManager.start();
  } catch (error) {
    console.error('Failed to start gateway:', error);
    console.log('Continuing without gateway - health checks will report degraded status');
  }

  // Wait for gateway to be ready before attempting auth
  try {
    await waitForGatewayReady(gatewayManager);

    // Attempt authentication (non-fatal if it fails)
    const authenticated = await attemptAuthentication(
      authService,
      config.ibkr.username,
      config.ibkr.password
    );

    if (authenticated) {
      // Start heartbeat interval only if authenticated
      const heartbeatInterval = setInterval(async () => {
        try {
          await authService.heartbeat();
        } catch (error) {
          console.error('Heartbeat failed:', error instanceof Error ? error.message : error);
        }
      }, config.session.heartbeatIntervalMs);

      // Clear on shutdown
      process.on('beforeExit', () => clearInterval(heartbeatInterval));
    }
  } catch (error) {
    console.warn('Gateway not ready, starting API in degraded mode:', error);
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
