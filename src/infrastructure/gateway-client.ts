import https from 'https';
import type { GatewayManager } from '../domain/gateway';

export interface GatewayClientConfig {
  baseUrl: string;
  timeout: number;
}

/**
 * HTTP client for communicating with the IBKR Client Portal Gateway.
 * All infrastructure implementations use this to make requests to the gateway.
 * 
 * Uses native https module to handle self-signed certificates from the gateway.
 */
export class GatewayClient {
  private readonly agent: https.Agent;

  constructor(
    private readonly config: GatewayClientConfig,
    private readonly _gatewayManager: GatewayManager
  ) {
    // IBKR gateway uses self-signed certificates
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.baseUrl);
      const bodyData = body ? JSON.stringify(body) : '';

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        agent: this.agent,
        headers: {
          'User-Agent': 'IBKR-REST-Bridge/1.0',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData),
          Accept: 'application/json',
        },
        timeout: this.config.timeout,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : ({} as T));
            } catch {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          } else {
            reject(
              new Error(`Gateway request failed: ${res.statusCode} ${res.statusMessage}`)
            );
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Gateway request error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Gateway request timed out after ${this.config.timeout}ms`));
      });

      if (bodyData) {
        req.write(bodyData);
      }

      req.end();
    });
  }
}
