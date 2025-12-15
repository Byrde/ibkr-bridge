# IBKR REST Bridge

A Dockerized service that provides a clean, conventional RESTful API for trading on Interactive Brokers.

## Setup

### Prerequisites

- Node.js 20+
- Docker (for containerized deployment)
- IBKR account with Client Portal Gateway access

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
| `IBKR_TOTP_SECRET` | TOTP secret for 2FA (base32 encoded) | No |
| `PORT` | Bridge API port | No (default: 3000) |
| `HOST` | Bridge API host | No (default: 0.0.0.0) |
| `GATEWAY_PORT` | IBKR Gateway port | No (default: 5000) |

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
