export interface Config {
  // Bridge API settings
  port: number;
  host: string;

  // Basic Auth credentials for bridge access
  auth: {
    username: string;
    password: string;
  };

  // IBKR credentials
  ibkr: {
    username: string;
    password: string;
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
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    host: process.env.HOST ?? '0.0.0.0',

    auth: {
      username: requireEnv('BRIDGE_USERNAME'),
      password: requireEnv('BRIDGE_PASSWORD'),
    },

    ibkr: {
      username: requireEnv('IBKR_USERNAME'),
      password: requireEnv('IBKR_PASSWORD'),
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




