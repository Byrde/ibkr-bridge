/**
 * Simple logger with log levels for the application.
 * Respects LOG_LEVEL environment variable: error, warn, info, debug
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getConfiguredLevel(): number {
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
  return LEVELS[level] ?? LEVELS.info;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] <= getConfiguredLevel();
}

function formatMessage(component: string, message: string): string {
  return `[${component}] ${message}`;
}

export function createLogger(component: string) {
  return {
    error(message: string, ...args: unknown[]): void {
      if (shouldLog('error')) {
        console.error(formatMessage(component, message), ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('warn')) {
        console.warn(formatMessage(component, message), ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (shouldLog('info')) {
        console.log(formatMessage(component, message), ...args);
      }
    },
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('debug')) {
        console.log(formatMessage(component, message), ...args);
      }
    },
  };
}
