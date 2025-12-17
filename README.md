# IBKR REST Bridge

A Dockerized service that provides a clean, conventional RESTful API for trading on Interactive Brokers.

## Live Trading vs Paper Trading

The bridge supports both live and paper trading accounts with different authentication requirements.

### Paper Trading

Paper trading accounts do **not** require 2FA. Simply set `IBKR_PAPER_TRADING=true` and provide your paper trading credentials.

To get your paper trading credentials:
1. Log into IBKR Client Portal with your live account
2. Go to Settings → Account Settings → Paper Trading Account
3. Configure/view your paper trading username and password

### Live Trading (2FA Required)

**Your live IBKR account MUST be configured with TOTP (Time-based One-Time Password) as the ONLY two-factor authentication method.**

This bridge automates the login flow using headless browser automation. It **will not work** if your account has:
- IB Key (mobile push notifications) enabled
- SMS-based 2FA
- Multiple 2FA methods configured
- Security Code Card as primary 2FA

To configure TOTP:
1. Log into IBKR Account Management
2. Go to Settings → Security → Secure Login System
3. Disable all other 2FA methods
4. Enable "Third Party Authenticator" (TOTP)
5. Save the TOTP secret (base32 encoded) for the `IBKR_TOTP_SECRET` environment variable

## Setup

### Prerequisites

- Node.js 20+
- Docker (for containerized deployment)
- IBKR account with Client Portal Gateway access
- **TOTP as the only 2FA method** (live trading only - see above)

### Installation

```bash
npm install
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BRIDGE_USERNAME` | Basic auth username for API access | Yes |
| `BRIDGE_PASSWORD` | Basic auth password for API access | Yes |
| `IBKR_USERNAME` | Interactive Brokers username | Yes |
| `IBKR_PASSWORD` | Interactive Brokers password | Yes |
| `IBKR_TOTP_SECRET` | TOTP secret for 2FA (base32 encoded) | Live only |
| `IBKR_PAPER_TRADING` | Set to `true` for paper trading mode | No |
| `PORT` | Bridge API port | No (default: 3000) |
| `HOST` | Bridge API host | No (default: 0.0.0.0) |
| `GATEWAY_PORT` | IBKR Gateway port | No (default: 5000) |

## API Documentation

Interactive OpenAPI/Swagger documentation is available at:

```
http://localhost:3000/documentation
```

The documentation is automatically generated from the route schemas and provides:
- Interactive API testing
- Request/response schemas
- Authentication configuration
- Example requests

See [docs/swagger.md](docs/swagger.md) for more details.

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

#### Live Trading

```bash
docker build -t ibkr-rest-bridge .

docker run -d \
  -p 3000:3000 \
  -e BRIDGE_USERNAME=admin \
  -e BRIDGE_PASSWORD=secret \
  -e IBKR_USERNAME=your_ibkr_user \
  -e IBKR_PASSWORD=your_ibkr_pass \
  -e IBKR_TOTP_SECRET=your_totp_secret \
  ibkr-rest-bridge
```

#### Paper Trading

```bash
docker run -d \
  -p 3000:3000 \
  -e BRIDGE_USERNAME=admin \
  -e BRIDGE_PASSWORD=secret \
  -e IBKR_USERNAME=your_paper_user \
  -e IBKR_PASSWORD=your_paper_pass \
  -e IBKR_PAPER_TRADING=true \
  ibkr-rest-bridge
```

#### Using an env file

```bash
docker run -d -p 3000:3000 --env-file .env ibkr-rest-bridge
```

> **Note:** When using `--env-file`, do **not** quote the values in your `.env` file:
> ```
> # Good
> IBKR_USERNAME=myusername
> 
> # Bad (quotes will be included in the value)
> IBKR_USERNAME="myusername"
> ```

### CLI

```bash
export BRIDGE_USERNAME=admin
export BRIDGE_PASSWORD=secret

npm run cli -- health
npm run cli -- account
npm run cli -- instruments AAPL
```

See [docs/cli.md](docs/cli.md) for full CLI reference.

### Build and Test

```bash
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

If authentication fails because of a competing session, restart the Docker container to get a fresh gateway instance. This can happen if a previous session wasn't cleanly terminated.

### Authentication fails with "no TOTP option found"

For live trading: Your IBKR account has multiple 2FA methods configured. You must disable all 2FA methods except TOTP. See the 2FA requirements section above.

For paper trading: Make sure `IBKR_PAPER_TRADING=true` is set. Paper trading accounts don't use 2FA.

### Login times out

- Verify your IBKR credentials are correct
- Ensure the TOTP secret is valid (base32 encoded)
- Check that your system clock is accurate (TOTP is time-sensitive)

### Session expires frequently

The bridge includes heartbeat maintenance to keep sessions alive. If sessions expire frequently, check the `HEARTBEAT_INTERVAL_MS` environment variable (default: 60000ms).




