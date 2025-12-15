# Domain-Driven Design (DDD) Strategy

### 1. Ubiquitous Language Glossary
| Term | Definition | Aliases |
| :--- | :--- | :--- |
| **Bridge** | The service that translates between conventional REST requests and the IBKR Gateway. | IBKR REST Bridge |
| **Gateway** | The IBKR Client Portal Gateway process that provides the underlying connection to Interactive Brokers. | IBKR Gateway, Client Portal |
| **Session** | An authenticated connection to the IBKR Gateway, requiring periodic maintenance to stay alive. | IBKR Session |
| **TOTP Challenge** | A two-factor authentication step requiring a time-based one-time password during IBKR login. | 2FA Challenge |
| **Heartbeat** | A periodic request sent to the Gateway to maintain session validity. | Tickle, Keep-alive |
| **Instrument** | A tradeable financial product identified by symbol and type (stock, option, etc.). | Contract, Security |
| **Order** | An instruction to buy or sell an instrument at specified terms. | Trade Order |
| **Position** | A holding of an instrument in an account, with quantity and cost basis. | Holding |
| **Quote** | Current market data for an instrument including bid, ask, and last price. | Market Data, Price |

### 2. Core Domain and Bounded Context

* **Core Domain:** IBKR Authentication and Session Management
    * The competitive advantage of this service is its ability to fully automate and abstract the complex IBKR authentication flow, including TOTP 2FA handling and transparent session maintenance. Without this, the trading APIs would be unusable.

* **Bounded Contexts:**
    * - **Authentication Context:** Handles bridge API authentication (Basic Auth) and IBKR Gateway authentication (credentials + TOTP). Manages session lifecycle including login, challenge response, session validation, and re-authentication.
    * - **Gateway Context:** Manages the IBKR Client Portal Gateway process lifecycle. Responsible for starting, monitoring, health-checking, and restarting the gateway process.
    * - **Trading Context:** Handles order placement, modification, and cancellation. Translates REST order requests into Gateway API calls and normalizes responses.
    * - **Market Data Context:** Handles instrument lookup and quote retrieval. Translates REST market data requests into Gateway API calls.
    * - **Account Context:** Handles account information retrieval including balances, positions, and order history. Aggregates data from multiple Gateway endpoints into coherent responses.

### 3. Aggregates

* **Session Aggregate**
    * **Aggregate Root:** `Session`
    * **Entities:** None
    * **Value Objects:** `Credentials`, `TOTPSecret`, `SessionToken`, `SessionStatus`
    * **Description:** Represents the authenticated session state with IBKR. Enforces invariants such as: a session cannot be used for trading until fully authenticated; TOTP must be provided when challenged; session must be refreshed before expiry.

* **Gateway Aggregate**
    * **Aggregate Root:** `Gateway`
    * **Entities:** None
    * **Value Objects:** `GatewayConfig`, `GatewayStatus`, `ProcessInfo`
    * **Description:** Represents the IBKR Client Portal Gateway process. Enforces invariants such as: only one gateway instance runs at a time; gateway must be healthy before accepting requests.

* **Order Aggregate**
    * **Aggregate Root:** `Order`
    * **Entities:** None
    * **Value Objects:** `OrderId`, `Instrument`, `OrderSide`, `OrderType`, `Quantity`, `Price`, `OrderStatus`
    * **Description:** Represents a trade order. Enforces invariants such as: quantity must be positive; limit orders require a price; orders can only be modified/cancelled if in a pending state.

* **Account Aggregate**
    * **Aggregate Root:** `Account`
    * **Entities:** `Position`
    * **Value Objects:** `AccountId`, `Balance`, `Currency`
    * **Description:** Represents a trading account with its positions and balances. Provides a read-model aggregating data from the Gateway.

* **Instrument Aggregate**
    * **Aggregate Root:** `Instrument`
    * **Entities:** None
    * **Value Objects:** `Symbol`, `InstrumentType`, `Exchange`, `ContractId`
    * **Description:** Represents a tradeable financial instrument. Used to resolve symbols to IBKR contract IDs required for trading and market data.
