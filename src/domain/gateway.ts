export type GatewayStatus = 'stopped' | 'starting' | 'running' | 'unhealthy' | 'stopping';

export interface GatewayConfig {
  gatewayPath: string;
  configPath: string;
  port: number;
}

export interface ProcessInfo {
  pid?: number;
  startedAt?: Date;
  restartCount: number;
}

export interface Gateway {
  status: GatewayStatus;
  config: GatewayConfig;
  process: ProcessInfo;
}

export interface GatewayManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): GatewayStatus;
  isHealthy(): Promise<boolean>;
  getBaseUrl(): string;
  getProcessInfo(): ProcessInfo;
}
