import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import https from 'https';
import type { Gateway, GatewayConfig, GatewayManager, GatewayStatus } from '../domain/gateway';

const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY_MS = 5000;
const HEALTH_CHECK_INTERVAL_MS = 30000;
const STARTUP_TIMEOUT_MS = 60000;
const STARTUP_POLL_INTERVAL_MS = 2000;

export interface GatewayManagerEvents {
  statusChange: (status: GatewayStatus) => void;
  healthChange: (healthy: boolean) => void;
  processExit: (code: number | null, signal: string | null) => void;
}

// HTTPS agent that accepts self-signed certificates (IBKR gateway uses self-signed)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export class IbkrGatewayManager extends EventEmitter implements GatewayManager {
  private gateway: Gateway;
  private process: ChildProcess | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private restartTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private lastHealthy = false;

  constructor(private readonly config: GatewayConfig) {
    super();
    this.gateway = {
      status: 'stopped',
      config,
      process: { restartCount: 0 },
    };
  }

  async start(): Promise<void> {
    if (this.gateway.status === 'running' || this.gateway.status === 'starting') {
      return;
    }

    this.isShuttingDown = false;
    this.setStatus('starting');

    try {
      await this.spawnGatewayProcess();
      await this.waitForGatewayReady();
      this.setStatus('running');
      this.startHealthChecks();
    } catch (error) {
      this.setStatus('stopped');
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.gateway.status === 'stopped') {
      return;
    }

    this.isShuttingDown = true;
    this.setStatus('stopping');
    this.stopHealthChecks();
    this.clearRestartTimeout();

    if (this.process) {
      await this.killProcess();
    }

    this.setStatus('stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.gateway.process.restartCount++;
    console.log(`Restarting gateway (attempt ${this.gateway.process.restartCount})...`);
    await this.start();
  }

  getStatus(): GatewayStatus {
    return this.gateway.status;
  }

  async isHealthy(): Promise<boolean> {
    if (this.gateway.status !== 'running') {
      return false;
    }

    return this.checkGatewayEndpoint();
  }

  getBaseUrl(): string {
    return `https://localhost:${this.config.port}`;
  }

  getProcessInfo(): { pid?: number; startedAt?: Date; restartCount: number } {
    return {
      pid: this.gateway.process.pid,
      startedAt: this.gateway.process.startedAt,
      restartCount: this.gateway.process.restartCount,
    };
  }

  private setStatus(status: GatewayStatus): void {
    if (this.gateway.status !== status) {
      console.log(`Gateway status: ${this.gateway.status} -> ${status}`);
      this.gateway.status = status;
      this.emit('statusChange', status);
    }
  }

  private async checkGatewayEndpoint(): Promise<boolean> {
    return new Promise((resolve) => {
      // Check the auth/status endpoint - it returns 401 when not authenticated
      // but that still confirms the gateway is running and accepting connections
      const url = new URL('/v1/api/iserver/auth/status', this.getBaseUrl());

      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
          agent: httpsAgent,
          timeout: 5000,
        },
        (res) => {
          // Gateway is healthy if it responds with any HTTP status
          // 200 = authenticated, 401/403 = not authenticated but running
          const code = res.statusCode ?? 0;
          resolve(code >= 200 && code < 500);
        }
      );

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  private async waitForGatewayReady(): Promise<void> {
    console.log('Waiting for gateway to become ready...');
    const startTime = Date.now();

    while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
      // Check if process is still running
      if (!this.process || this.process.killed) {
        throw new Error('Gateway process terminated during startup');
      }

      if (await this.checkGatewayEndpoint()) {
        console.log('Gateway is ready');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_INTERVAL_MS));
    }

    throw new Error(`Gateway did not become ready within ${STARTUP_TIMEOUT_MS}ms`);
  }

  private async spawnGatewayProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const runScript = `${this.config.gatewayPath}/bin/run.sh`;
      const configFile = 'root/conf.yaml';

      console.log(`Starting gateway: ${runScript} ${configFile}`);

      this.process = spawn(runScript, [configFile], {
        cwd: this.config.gatewayPath,
        env: {
          ...process.env,
          // Pass the port via Java options
          JAVA_OPTS: `-Dserver.port=${this.config.port}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true, // Use shell to handle script execution
      });

      this.gateway.process.pid = this.process.pid;
      this.gateway.process.startedAt = new Date();

      let startupError: Error | null = null;

      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach((line) => {
          console.log(`[gateway] ${line}`);
          // Detect successful startup message
          if (line.includes('Server started')) {
            console.log('Gateway startup message detected');
          }
        });
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach((line) => {
          console.error(`[gateway:err] ${line}`);
          // Capture startup errors
          if (line.includes('Error') || line.includes('Exception')) {
            startupError = new Error(line);
          }
        });
      });

      this.process.on('error', (error) => {
        console.error('Gateway process error:', error.message);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`Gateway process exited (code=${code}, signal=${signal})`);
        this.emit('processExit', code, signal);
        this.process = null;
        this.gateway.process.pid = undefined;

        if (!this.isShuttingDown && this.gateway.status === 'running') {
          this.handleUnexpectedExit(code, signal);
        }
      });

      // Give the process a moment to fail immediately (e.g., script not found)
      setTimeout(() => {
        if (startupError) {
          reject(startupError);
        } else if (this.process && !this.process.killed) {
          resolve();
        } else {
          reject(new Error('Gateway process failed to start'));
        }
      }, 500);
    });
  }

  private async killProcess(): Promise<void> {
    const proc = this.process;
    if (!proc) {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          console.log('Force killing gateway process...');
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 10000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      console.log('Sending SIGTERM to gateway process...');
      proc.kill('SIGTERM');
    });
  }

  private handleUnexpectedExit(code: number | null, signal: string | null): void {
    console.error(`Gateway exited unexpectedly (code=${code}, signal=${signal})`);
    this.setStatus('unhealthy');

    if (this.gateway.process.restartCount >= MAX_RESTART_ATTEMPTS) {
      console.error(`Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded, giving up`);
      this.setStatus('stopped');
      return;
    }

    console.log(`Scheduling restart in ${RESTART_DELAY_MS}ms...`);
    this.restartTimeout = setTimeout(async () => {
      try {
        await this.restart();
      } catch (error) {
        console.error('Failed to restart gateway:', error);
      }
    }, RESTART_DELAY_MS);
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.gateway.status !== 'running') {
        return;
      }

      const healthy = await this.isHealthy();

      if (healthy !== this.lastHealthy) {
        console.log(`Gateway health changed: ${this.lastHealthy} -> ${healthy}`);
        this.lastHealthy = healthy;
        this.emit('healthChange', healthy);
      }

      if (!healthy && !this.isShuttingDown) {
        console.warn('Gateway health check failed, triggering restart...');
        this.setStatus('unhealthy');
        this.handleUnexpectedExit(null, null);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private clearRestartTimeout(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
  }
}
