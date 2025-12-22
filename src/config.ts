export interface Config {
  // API server settings
  port: number;
  host: string;

  // Basic Auth credentials for API access (optional - if not set, API is unprotected)
  auth?: {
    username: string;
    password: string;
  };

  // Feature flags
  /** When true, automatically authenticate at startup and maintain session */
  enableAutoAuth: boolean;
  /** When true, expose /api/gateway/* proxy to IBKR gateway */
  enableGatewayProxy: boolean;

  // IBKR credentials (required when enableAutoAuth is true)
  ibkr: {
    username?: string;
    password?: string;
    totpSecret?: string;
    /** Paper trading mode - uses paper trading toggle, no 2FA required */
    paperTrading: boolean;
  };

  // Gateway settings
  gateway: {
    path: string;
    configPath: string;
    port: number;
  };

  // Session settings
  session: {
    heartbeatIntervalMs: number;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  // Strip surrounding quotes (Docker --env-file may include them)
  return value.replace(/^["']|["']$/g, '').trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  // Strip surrounding quotes (Docker --env-file may include them)
  return value.replace(/^["']|["']$/g, '').trim();
}

export function loadConfig(): Config {
  const enableAutoAuth = optionalEnv('ENABLE_AUTO_AUTH')?.toLowerCase() !== 'false';
  const enableGatewayProxy = optionalEnv('ENABLE_GATEWAY_PROXY')?.toLowerCase() === 'true';

  // IBKR credentials are required when auto auth is enabled
  const ibkrUsername = enableAutoAuth ? requireEnv('IBKR_USERNAME') : optionalEnv('IBKR_USERNAME');
  const ibkrPassword = enableAutoAuth ? requireEnv('IBKR_PASSWORD') : optionalEnv('IBKR_PASSWORD');

  // Basic auth is optional - only configure if both username and password are set
  const bridgeUsername = optionalEnv('BRIDGE_USERNAME');
  const bridgePassword = optionalEnv('BRIDGE_PASSWORD');
  const auth = bridgeUsername && bridgePassword
    ? { username: bridgeUsername, password: bridgePassword }
    : undefined;

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',

    auth,

    enableAutoAuth,
    enableGatewayProxy,

    ibkr: {
      username: ibkrUsername,
      password: ibkrPassword,
      totpSecret: optionalEnv('IBKR_TOTP_SECRET'),
      paperTrading: optionalEnv('IBKR_PAPER_TRADING')?.toLowerCase() === 'true',
    },

    gateway: {
      path: process.env.GATEWAY_PATH ?? '/opt/ibkr',
      configPath: process.env.GATEWAY_CONFIG_PATH ?? '/opt/ibkr/root/conf.yaml',
      port: parseInt(process.env.GATEWAY_PORT ?? '5000', 10),
    },

    session: {
      heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '60000', 10),
    },
  };
}




