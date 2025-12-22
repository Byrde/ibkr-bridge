# IBKR REST Bridge

A Dockerized REST API bridge for Interactive Brokers Client Portal Gateway. Provides automatic session management, headless authentication, and a clean REST API for trading.

## Features

- **Automatic Authentication** — Headless browser login with TOTP support
- **Session Management** — Automatic heartbeat and re-authentication
- **REST API** — Clean endpoints for accounts, orders, and market data
- **Gateway Proxy** — Optional direct proxy to IBKR Gateway API
- **Configurable** — Enable/disable features via environment variables

## Setup

- Node.js 20+
- Docker (for containerized deployment)
- IBKR account with Client Portal Gateway access
- **TOTP as the only 2FA method** (live trading only - see below)

## Quick Start

### Docker (Recommended)

```bash
# Build the image
docker build -t ibkr-bridge .

# Run with auto-auth (default)
docker run -d -p 3000:3000 \
  -e IBKR_USERNAME=your_user \
  -e IBKR_PASSWORD=your_pass \
  -e IBKR_PAPER_TRADING=true \
  ibkr-bridge

# Run with manual auth (no IBKR credentials required at startup)
docker run -d -p 3000:3000 \
  -e ENABLE_AUTO_AUTH=false \
  ibkr-bridge
```

### Local Development

```bash
npm install
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_AUTO_AUTH` | Auto-authenticate on startup | `true` |
| `ENABLE_GATEWAY_PROXY` | Expose `/api/gateway/*` proxy | `false` |
| `BRIDGE_USERNAME` | Basic auth username (optional) | - |
| `BRIDGE_PASSWORD` | Basic auth password (optional) | - |
| `IBKR_USERNAME` | IBKR username (required if auto-auth) | - |
| `IBKR_PASSWORD` | IBKR password (required if auto-auth) | - |
| `IBKR_TOTP_SECRET` | TOTP secret for 2FA (base32) | - |
| `IBKR_PAPER_TRADING` | Use paper trading mode | `false` |
| `PORT` | API server port | `3000` |
| `HOST` | API server host | `0.0.0.0` |
| `GATEWAY_PORT` | IBKR Gateway port | `5000` |
| `HEARTBEAT_INTERVAL_MS` | Session heartbeat interval | `60000` |

### Basic Auth

Basic auth is **optional**. If `BRIDGE_USERNAME` and `BRIDGE_PASSWORD` are both set, all API endpoints (except `/api/v1/health`) require authentication. If not set, the API is unprotected.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Health check (always public) |
| `GET /api/v1/auth/status` | Authentication status |
| `POST /api/v1/auth/login` | Manual login (when auto-auth disabled) |
| `GET /api/v1/account` | Account info with balances and positions |
| `GET /api/v1/orders` | List open orders |
| `POST /api/v1/orders` | Place an order |
| `DELETE /api/v1/orders/:id` | Cancel an order |
| `GET /api/v1/quote/:symbol` | Get quote for symbol |

### Gateway Proxy

When `ENABLE_GATEWAY_PROXY=true`, all requests to `/api/gateway/*` are proxied to the IBKR Gateway at `/v1/api/*`. This gives you direct access to the full IBKR API.

```bash
# Enable proxy
docker run -d -p 3000:3000 \
  -e ENABLE_AUTO_AUTH=false \
  -e ENABLE_GATEWAY_PROXY=true \
  ibkr-bridge

# Access IBKR API directly
curl http://localhost:3000/api/gateway/portfolio/accounts
```

## Usage Modes

### Mode 1: Auto-Auth (Default)

The bridge automatically authenticates on startup and maintains the session.

```bash
docker run -d -p 3000:3000 \
  -e IBKR_USERNAME=your_user \
  -e IBKR_PASSWORD=your_pass \
  -e IBKR_PAPER_TRADING=true \
  ibkr-bridge
```

### Mode 2: Manual Auth

Disable auto-auth and authenticate via the API when needed.

```bash
docker run -d -p 3000:3000 \
  -e ENABLE_AUTO_AUTH=false \
  ibkr-bridge

# Then authenticate via API
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_user", "password": "your_pass", "paperTrading": true}'
```

### Mode 3: Gateway Proxy Only

Use the bridge as a simple proxy to the IBKR Gateway.

```bash
docker run -d -p 3000:3000 \
  -e ENABLE_AUTO_AUTH=false \
  -e ENABLE_GATEWAY_PROXY=true \
  ibkr-bridge
```

## Live Trading vs Paper Trading

### Paper Trading

Paper trading accounts do **not** require 2FA. Set `IBKR_PAPER_TRADING=true` and provide your paper trading credentials.

To get paper trading credentials:
1. Log into IBKR Client Portal with your live account
2. Go to Settings → Account Settings → Paper Trading Account
3. Configure/view your paper trading username and password

### Live Trading (2FA Required)

**Your live IBKR account MUST be configured with TOTP as the ONLY 2FA method.**

This bridge automates login using headless browser automation. It **will not work** if your account has:
- IB Key (mobile push notifications) enabled
- SMS-based 2FA
- Multiple 2FA methods configured
- Security Code Card as primary 2FA

To configure TOTP:
1. Log into IBKR Account Management
2. Go to Settings → Security → Secure Login System
3. Disable all other 2FA methods
4. Enable "Third Party Authenticator" (TOTP)
5. Save the TOTP secret (base32 encoded) for `IBKR_TOTP_SECRET`

## CLI

```bash
export BRIDGE_URL=http://localhost:3000
export BRIDGE_USERNAME=admin
export BRIDGE_PASSWORD=secret

npm run cli -- health
npm run cli -- account
npm run cli -- quote AAPL
```

See [docs/cli.md](docs/cli.md) for full CLI reference.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Build
npm run build
```

## Troubleshooting

### Authentication fails with "competing session"

Restart the Docker container to get a fresh gateway instance. This happens if a previous session wasn't cleanly terminated.

### Authentication fails with "no TOTP option found"

For live trading: Your IBKR account has multiple 2FA methods configured. Disable all except TOTP.

For paper trading: Make sure `IBKR_PAPER_TRADING=true` is set.

### Login times out

- Verify your IBKR credentials are correct
- Ensure the TOTP secret is valid (base32 encoded)
- Check that your system clock is accurate (TOTP is time-sensitive)

### Session expires frequently

The bridge includes heartbeat maintenance. If sessions expire frequently, check `HEARTBEAT_INTERVAL_MS` (default: 60000ms).
