# Software Development Project: IBKR REST Bridge

## Overview

### 1. Project Name
* **IBKR REST Bridge**

### 2. Project Description
* A Dockerized service that provides a clean, conventional RESTful API for trading on Interactive Brokers. It acts as a bridge between clients and IBKR's Client Portal Gateway, abstracting away the complexity of their unconventional SDK-oriented API and authentication flows.

### 3. Project Vision
* To eliminate the friction of integrating with Interactive Brokers by providing a simple, well-documented REST API that handles all authentication complexity (including TOTP 2FA and session management) transparently. Developers and trading systems can interact with IBKR using standard HTTP conventions without dealing with gateway orchestration or session maintenance.

### 4. Problem Statement
* Interactive Brokers provides powerful trading capabilities, but their Client Portal Gateway requires complex authentication flows (including TOTP 2FA challenges), manual session maintenance, and SDK-style interactions that don't align with modern REST conventions. This creates significant integration overhead for developers building trading applications.

### 5. Target Audience
* **Primary Audience:** Developers and teams building automated trading systems, portfolio management tools, or financial applications that need programmatic access to Interactive Brokers.
* **Secondary Audience:** Individual traders who want to build personal automation scripts with a simple API interface.

### 6. Key Features
* - **API Authentication:** Basic Auth protection for the bridge API itself, with credentials configurable via Docker environment variables.
* - **IBKR Authentication Management:** Full lifecycle handling of IBKR login including TOTP 2FA challenge/response, session heartbeat maintenance, and automatic re-authentication when sessions expire.
* - **Gateway Orchestration:** Setup, configuration, and lifecycle management of the IBKR Client Portal Gateway process within the Docker container.
* - **Trading API:** RESTful endpoints for placing, modifying, and canceling orders across supported asset types.
* - **Market Data API:** RESTful endpoints for retrieving real-time and delayed quotes for stocks, options, and other instruments.
* - **Account API:** RESTful endpoints for retrieving account information including balances, open positions, pending orders, and order history.

### 7. Technology Stack
* **Runtime:** Node.js with TypeScript
* **Framework:** Fastify (high-performance, schema-based validation)
* **IBKR Integration:** IBKR Client Portal Gateway (bundled in container)
* **Authentication:** Basic Auth (bridge access), otplib (TOTP for IBKR 2FA)
* **Deployment:** Docker
* **Testing:** Jest

### 8. Development & Validation Requirements

This project requires **end-to-end Docker validation** for all features. The IBKR Client Portal Gateway is a complex Java process that must be orchestrated correctly within the container. Features cannot be considered complete based on unit tests alone.

**Validation checklist for every task:**
1. Docker image builds successfully
2. Gateway process starts and becomes healthy
3. Bridge API starts and connects to gateway
4. Feature works correctly via CLI/API against running container
5. No errors or warnings in container logs

This ensures the integration between the Node.js application and the IBKR Gateway works correctly in the production-like environment.
