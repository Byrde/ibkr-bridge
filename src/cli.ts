#!/usr/bin/env node

const BASE_URL = process.env.BRIDGE_URL ?? 'http://localhost:3000';
const AUTH_USERNAME = process.env.BRIDGE_USERNAME ?? '';
const AUTH_PASSWORD = process.env.BRIDGE_PASSWORD ?? '';

function getAuthHeader(): string {
  if (!AUTH_USERNAME || !AUTH_PASSWORD) {
    return '';
  }
  const credentials = Buffer.from(`${AUTH_USERNAME}:${AUTH_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const auth = getAuthHeader();
  if (auth) {
    headers['Authorization'] = auth;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Request failed: ${response.status} ${response.statusText}\n${error}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printUsage(): void {
  console.log(`
IBKR REST Bridge CLI

Usage: npm run cli -- <command> [options]

Environment Variables:
  BRIDGE_URL        Base URL of the bridge (default: http://localhost:3000)
  BRIDGE_USERNAME   Basic auth username
  BRIDGE_PASSWORD   Basic auth password

Commands:
  health                          Check bridge and gateway health
  account                         Get account information
  positions                       Get current positions
  orders                          List open orders
  order:place <conid> <side> <qty> [--type <type>] [--limit <price>]
                                  Place a new order
  order:cancel <orderId>          Cancel an order
  instruments <query>             Search for instruments
  quote <conid>                   Get quote for instrument

Examples:
  npm run cli -- health
  npm run cli -- account
  npm run cli -- positions
  npm run cli -- instruments AAPL
  npm run cli -- quote 265598
  npm run cli -- order:place 265598 buy 10 --type limit --limit 150.00
  npm run cli -- orders
  npm run cli -- order:cancel 12345
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'health': {
        const result = await request('GET', '/api/v1/health');
        printJson(result);
        break;
      }

      case 'account': {
        const result = await request('GET', '/api/v1/account');
        printJson(result);
        break;
      }

      case 'positions': {
        const result = await request('GET', '/api/v1/account/positions');
        printJson(result);
        break;
      }

      case 'orders': {
        const result = await request('GET', '/api/v1/orders');
        printJson(result);
        break;
      }

      case 'order:place': {
        const conid = parseInt(args[1], 10);
        const side = args[2];
        const quantity = parseInt(args[3], 10);

        if (isNaN(conid) || !side || isNaN(quantity)) {
          console.error('Usage: order:place <conid> <side> <quantity> [--type <type>] [--limit <price>]');
          process.exit(1);
        }

        let orderType = 'market';
        let limitPrice: number | undefined;

        for (let i = 4; i < args.length; i++) {
          if (args[i] === '--type' && args[i + 1]) {
            orderType = args[i + 1];
            i++;
          } else if (args[i] === '--limit' && args[i + 1]) {
            limitPrice = parseFloat(args[i + 1]);
            i++;
          }
        }

        const order = {
          conid,
          side,
          type: orderType,
          quantity,
          limitPrice,
        };

        const result = await request('POST', '/api/v1/orders', order);
        printJson(result);
        break;
      }

      case 'order:cancel': {
        const orderId = args[1];
        if (!orderId) {
          console.error('Usage: order:cancel <orderId>');
          process.exit(1);
        }

        await request('DELETE', `/api/v1/orders/${orderId}`);
        console.log(`Order ${orderId} cancelled`);
        break;
      }

      case 'instruments': {
        const query = args[1];
        if (!query) {
          console.error('Usage: instruments <query>');
          process.exit(1);
        }

        const result = await request('GET', `/api/v1/instruments?q=${encodeURIComponent(query)}`);
        printJson(result);
        break;
      }

      case 'quote': {
        const conid = args[1];
        if (!conid) {
          console.error('Usage: quote <conid>');
          process.exit(1);
        }

        const result = await request('GET', `/api/v1/quotes/${conid}`);
        printJson(result);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();



