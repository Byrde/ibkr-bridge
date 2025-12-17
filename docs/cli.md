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
| `IBKR_TOTP_SECRET` | Base32-encoded TOTP secret for 2FA | **Yes*** |

> **Important:** Your IBKR account **must** have TOTP configured as the **only** 2FA method. The bridge does not support IB Key (mobile push), SMS, or multiple 2FA methods. See the main README for setup instructions.

*The `IBKR_TOTP_SECRET` is required for automated login. Without it, the bridge cannot complete the 2FA challenge.

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

### instruments

Search for instruments by symbol or name.

```bash
npm run cli -- instruments <query>
```

**Example:**
```bash
npm run cli -- instruments AAPL
```

### quote

Get current quote for an instrument.

```bash
npm run cli -- quote <conid>
```

**Example:**
```bash
npm run cli -- quote 265598
```
