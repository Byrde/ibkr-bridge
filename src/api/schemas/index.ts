// OpenAPI schemas for API documentation
// These schemas define the request/response structures for Swagger/OpenAPI

export const ErrorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
  required: ['error'],
} as const;

// Account schemas
export const BalanceSchema = {
  type: 'object',
  properties: {
    currency: { type: 'string', example: 'USD' },
    cash: { type: 'number', example: 10000.0 },
    totalValue: { type: 'number', example: 50000.0 },
    buyingPower: { type: 'number', example: 40000.0 },
  },
  required: ['currency', 'cash', 'totalValue', 'buyingPower'],
} as const;

export const PositionSchema = {
  type: 'object',
  properties: {
    conid: { type: 'integer', example: 265598 },
    symbol: { type: 'string', example: 'AAPL' },
    type: { type: 'string', example: 'STK' },
    quantity: { type: 'number', example: 100 },
    avgCost: { type: 'number', example: 150.25 },
    marketValue: { type: 'number', example: 17500.0 },
    unrealizedPnl: { type: 'number', example: 475.0 },
  },
  required: ['conid', 'symbol', 'type', 'quantity', 'avgCost', 'marketValue', 'unrealizedPnl'],
} as const;

export const AccountSchema = {
  type: 'object',
  properties: {
    accountId: { type: 'string', example: 'U1234567' },
    accountType: { type: 'string', example: 'Individual' },
    baseCurrency: { type: 'string', example: 'USD' },
    balances: { type: 'array', items: BalanceSchema },
    positions: { type: 'array', items: PositionSchema },
  },
  required: ['accountId', 'accountType', 'baseCurrency', 'balances', 'positions'],
} as const;

export const PositionsResponseSchema = {
  type: 'object',
  properties: {
    positions: { type: 'array', items: PositionSchema },
  },
  required: ['positions'],
} as const;

// Order schemas
export const InstrumentSchema = {
  type: 'object',
  properties: {
    conid: { type: 'integer', example: 265598 },
    symbol: { type: 'string', example: 'AAPL' },
    type: { type: 'string', enum: ['stock', 'option', 'future', 'forex', 'other'], example: 'stock' },
    exchange: { type: 'string', example: 'NASDAQ' },
    currency: { type: 'string', example: 'USD' },
  },
  required: ['conid', 'symbol', 'type'],
} as const;

export const OrderSchema = {
  type: 'object',
  properties: {
    orderId: { type: 'string', example: '1234567890' },
    accountId: { type: 'string', example: 'U1234567' },
    instrument: InstrumentSchema,
    side: { type: 'string', enum: ['buy', 'sell'], example: 'buy' },
    type: { type: 'string', enum: ['market', 'limit', 'stop'], example: 'limit' },
    quantity: { type: 'number', example: 100 },
    limitPrice: { type: 'number', example: 150.0 },
    stopPrice: { type: 'number', example: 145.0 },
    timeInForce: { type: 'string', enum: ['DAY', 'GTC'], example: 'DAY' },
    parentId: { type: 'string', description: 'Parent order ID for attached orders' },
    clientOrderId: { type: 'string', description: 'Client-assigned order ID' },
    status: {
      type: 'string',
      enum: ['pending', 'submitted', 'filled', 'partially_filled', 'cancelled', 'rejected'],
      example: 'submitted',
    },
    filledQuantity: { type: 'number', example: 0 },
    avgFillPrice: { type: 'number', example: 150.25 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'orderId',
    'accountId',
    'instrument',
    'side',
    'type',
    'quantity',
    'timeInForce',
    'status',
    'filledQuantity',
    'createdAt',
    'updatedAt',
  ],
} as const;

export const CreateOrderRequestSchema = {
  type: 'object',
  properties: {
    conid: { type: 'integer', description: 'Contract ID of the instrument', example: 265598 },
    side: { type: 'string', enum: ['buy', 'sell'], example: 'buy' },
    type: { type: 'string', enum: ['market', 'limit', 'stop'], example: 'market' },
    quantity: { type: 'number', minimum: 1, example: 100 },
    limitPrice: { type: 'number', description: 'Required for limit orders', example: 150.0 },
    stopPrice: { type: 'number', description: 'Required for stop orders', example: 145.0 },
    timeInForce: { type: 'string', enum: ['DAY', 'GTC'], default: 'DAY', example: 'DAY' },
    clientOrderId: { type: 'string', description: 'Client-assigned order ID for referencing in parentId' },
    parentId: { type: 'string', description: 'Parent order ID (for attached stop-loss orders)' },
  },
  required: ['conid', 'side', 'type', 'quantity'],
} as const;

export const ModifyOrderRequestSchema = {
  type: 'object',
  properties: {
    quantity: { type: 'number', minimum: 1, example: 50 },
    limitPrice: { type: 'number', example: 155.0 },
    stopPrice: { type: 'number', example: 145.0 },
  },
} as const;

export const OrdersResponseSchema = {
  type: 'object',
  properties: {
    orders: { type: 'array', items: OrderSchema },
  },
  required: ['orders'],
} as const;

// Market data schemas
export const InstrumentSearchResultSchema = {
  type: 'object',
  properties: {
    conid: { type: 'integer', example: 265598 },
    symbol: { type: 'string', example: 'AAPL' },
    description: { type: 'string', example: 'APPLE INC' },
    type: { type: 'string', example: 'STK' },
    exchange: { type: 'string', example: 'NASDAQ' },
  },
  required: ['conid', 'symbol', 'description', 'type', 'exchange'],
} as const;

export const InstrumentsResponseSchema = {
  type: 'object',
  properties: {
    instruments: { type: 'array', items: InstrumentSearchResultSchema },
  },
  required: ['instruments'],
} as const;

export const QuoteSchema = {
  type: 'object',
  properties: {
    conid: { type: 'integer', example: 265598 },
    symbol: { type: 'string', example: 'AAPL' },
    lastPrice: { type: 'number', example: 175.5 },
    bidPrice: { type: 'number', example: 175.45 },
    askPrice: { type: 'number', example: 175.55 },
    bidSize: { type: 'integer', example: 100 },
    askSize: { type: 'integer', example: 200 },
    volume: { type: 'integer', example: 5000000 },
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['conid', 'symbol', 'timestamp'],
} as const;

// Health schemas
export const HealthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['healthy', 'degraded'], example: 'healthy' },
    gateway: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'running' },
        healthy: { type: 'boolean', example: true },
        pid: { type: 'integer', example: 12345 },
        startedAt: { type: 'string', format: 'date-time' },
        restartCount: { type: 'integer', example: 0 },
      },
      required: ['status', 'healthy', 'restartCount'],
    },
    session: {
      type: 'object',
      properties: {
        authenticated: { type: 'boolean', example: true },
      },
      required: ['authenticated'],
    },
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['status', 'gateway', 'session', 'timestamp'],
} as const;

// Auth schemas
export const AuthStatusResponseSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['disconnected', 'authenticating', 'awaiting_totp', 'authenticated', 'expired'],
      example: 'authenticated',
    },
    authenticated: { type: 'boolean', example: true },
    reauthenticating: { type: 'boolean', example: false },
    authenticatedAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    lastHeartbeat: { type: 'string', format: 'date-time' },
    timestamp: { type: 'string', format: 'date-time' },
  },
  required: ['status', 'authenticated', 'reauthenticating', 'timestamp'],
} as const;
