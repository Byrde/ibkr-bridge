# CLI Reference

The IBKR REST Bridge provides a command-line interface for interacting with the API.

## Configuration

Set the following environment variables before using the CLI:

| Variable | Description | Default |
|----------|-------------|---------|
| `BRIDGE_URL` | Base URL of the bridge API | `http://localhost:3000` |
| `BRIDGE_USERNAME` | Basic auth username | (required) |
| `BRIDGE_PASSWORD` | Basic auth password | (required) |

### Docker Container Configuration

When running the bridge in Docker, configure these additional environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `IBKR_USERNAME` | Your IBKR account username | Yes |
| `IBKR_PASSWORD` | Your IBKR account password | Yes |
| `IBKR_TOTP_SECRET` | Base32-encoded TOTP secret for 2FA | Live only |
| `IBKR_PAPER_TRADING` | Set to `true` for paper trading mode | No |

#### Live Trading

For live trading accounts, your IBKR account **must** have TOTP configured as the **only** 2FA method. The bridge does not support IB Key (mobile push), SMS, or multiple 2FA methods. The `IBKR_TOTP_SECRET` is required for automated login.

#### Paper Trading

For paper trading, set `IBKR_PAPER_TRADING=true`. Paper trading accounts:
- Use separate credentials from live accounts (configure in IBKR Client Portal)
- Do **not** require 2FA (no `IBKR_TOTP_SECRET` needed)
- The login page automatically switches to paper trading mode

**Example `.paper.env` file:**
```
IBKR_USERNAME=your_paper_username
IBKR_PASSWORD=your_paper_password
IBKR_PAPER_TRADING=true
```

## Usage

```bash
npm run cli -- <command> [options]
```

## Commands

### health

Check bridge and gateway health status.

```bash
npm run cli -- health
```

**Response:**
```json
{
  "status": "healthy",
  "gateway": { "status": "running", "healthy": true },
  "session": { "authenticated": true },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### auth:status

Get current authentication session status.

```bash
npm run cli -- auth:status
```

**Response:**
```json
{
  "status": "authenticated",
  "authenticated": true,
  "reauthenticating": false,
  "authenticatedAt": "2024-01-01T00:00:00.000Z",
  "lastHeartbeat": "2024-01-01T00:05:00.000Z",
  "timestamp": "2024-01-01T00:05:30.000Z"
}
```

**Fields:**
- `status` - Session state: `disconnected`, `authenticating`, `awaiting_totp`, `authenticated`, or `expired`
- `authenticated` - Boolean indicating if currently authenticated
- `reauthenticating` - Boolean indicating if re-authentication is in progress
- `authenticatedAt` - Timestamp when session was authenticated
- `expiresAt` - Timestamp when session expires (if known)
- `lastHeartbeat` - Timestamp of last successful heartbeat

### account

Get account information including balances.

```bash
npm run cli -- account
```

### positions

Get current portfolio positions.

```bash
npm run cli -- positions
```

### orders

List open and recent orders.

```bash
npm run cli -- orders
```

### order:place

Place a new order.

```bash
npm run cli -- order:place <conid> <side> <quantity> [--type <type>] [--limit <price>]
```

**Arguments:**
- `conid` - IBKR contract ID (use `instruments` command to find)
- `side` - `buy` or `sell`
- `quantity` - Number of shares/contracts

**Options:**
- `--type` - Order type: `market` (default) or `limit`
- `--limit` - Limit price (required for limit orders)

**Examples:**
```bash
# Market order: buy 10 shares
npm run cli -- order:place 265598 buy 10

# Limit order: buy 10 shares at $150.00
npm run cli -- order:place 265598 buy 10 --type limit --limit 150.00
```

### order:cancel

Cancel a pending order.

```bash
npm run cli -- order:cancel <orderId>
```

### quote

Get current quote for a symbol.

```bash
npm run cli -- quote <symbol> [--secType <type>]
```

**Arguments:**
- `symbol` - Ticker symbol (e.g., `AAPL`, `SLV`)

**Options:**
- `--secType` - Optional security type filter (e.g., `STK`, `ETF`, `FUT`, `OPT`). If not specified, defaults to preferring `STK` (stock) type if available.

**Examples:**
```bash
# Get quote for AAPL (defaults to stock)
npm run cli -- quote AAPL

# Get quote for SLV as ETF
npm run cli -- quote SLV --secType ETF
```

**Response:**
```json
{
  "conid": 265598,
  "symbol": "AAPL",
  "lastPrice": 271.30,
  "bidPrice": 271.10,
  "askPrice": 271.30,
  "bidSize": 100,
  "askSize": 300,
  "volume": 188700,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```
