# Project Backlog

| Epic | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Gateway Orchestration** | Implement Gateway process manager | Gateway process starts on application boot; health check endpoint returns gateway status; process restarts automatically on unexpected exit. | `Complete` |  | Foundation for all other features. Must complete first. |
| **Gateway Orchestration** | Implement Gateway health monitoring | Periodic health checks detect gateway failures; unhealthy state triggers restart; health status exposed via internal API. | `Complete` |  | Depends on process manager. |
| **IBKR Authentication Management** | Implement initial IBKR login flow | Credentials submitted to gateway; successful login returns session token; failed login returns appropriate error. | `Ready to Test` |  | Requires running gateway. |
| **IBKR Authentication Management** | Implement TOTP 2FA challenge handling | TOTP challenge detected during login; TOTP code generated from secret; challenge response submitted automatically. | `TODO` |  | Uses otplib for TOTP generation. |
| **IBKR Authentication Management** | Implement session heartbeat maintenance | Heartbeat sent at configured interval; session expiry detected; metrics/logs for session health. | `TODO` |  | Keeps session alive during idle periods. |
| **IBKR Authentication Management** | Implement automatic re-authentication | Session expiry triggers re-authentication; re-auth uses stored credentials + TOTP; in-flight requests wait or retry. | `TODO` |  | Critical for long-running deployments. |
| **API Authentication** | Implement Basic Auth middleware | Requests without valid Basic Auth header rejected with 401; credentials validated against env vars; authenticated requests proceed. | `Ready to Test` |  | Secures all bridge endpoints. Implemented during scaffolding. |
| **Account API** | Implement account info endpoint | GET /account returns account ID, balances, and currency; response follows consistent schema. | `TODO` |  | Read-only, lower risk starting point for API. |
| **Account API** | Implement positions endpoint | GET /account/positions returns list of current positions with symbol, quantity, avg cost, market value. | `TODO` |  | Depends on account info. |
| **Account API** | Implement orders list endpoint | GET /account/orders returns list of open/recent orders with status, filled quantity, timestamps. | `TODO` |  | Shows pending and historical orders. |
| **Market Data API** | Implement instrument search endpoint | GET /instruments?q={query} returns matching instruments with symbol, type, exchange, conid. | `TODO` |  | Required to resolve symbols for trading. |
| **Market Data API** | Implement quote endpoint | GET /quotes/{conid} returns current bid, ask, last, volume for instrument. | `TODO` |  | Requires valid conid from instrument search. |
| **Trading API** | Implement order placement endpoint | POST /orders creates new order; supports market and limit order types; returns order ID and initial status. | `TODO` |  | Core trading capability. |
| **Trading API** | Implement order modification endpoint | PUT /orders/{orderId} modifies pending order; supports quantity and price changes; returns updated status. | `TODO` |  | Only works on pending orders. |
| **Trading API** | Implement order cancellation endpoint | DELETE /orders/{orderId} cancels pending order; returns confirmation or error if not cancellable. | `TODO` |  | Only works on pending orders. |

Notes:
- The `Status` column must follow: `TODO` → `In Progress` → `Ready to Test` → `Complete`.
- The `Prototype` column is maintained by the prototyping workflow. Leave it empty for new tasks. When a prototype is created, this column should include where to find it (e.g., `prototypes/[task-or-feature].[ext]`) plus a brief note on scope/findings.

## Development Validation Requirements

**All tasks must be validated end-to-end in the Docker environment.** This means:

1. **Build the Docker image** after each task implementation
2. **Run the container** with appropriate environment variables
3. **Verify gateway startup** - the IBKR Client Portal Gateway process must start successfully
4. **Verify application startup** - the bridge API must start and connect to the gateway
5. **Test the feature** via CLI or direct API calls against the running container
6. **Check logs** for any errors or warnings during the validation

Do not mark a task as `Complete` until it has been validated in the Docker environment. Unit tests alone are insufficient.
