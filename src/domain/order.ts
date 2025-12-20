export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'pending' | 'submitted' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';
export type TimeInForce = 'DAY' | 'GTC';

export interface Instrument {
  conid: number;
  symbol: string;
  type: 'stock' | 'option' | 'future' | 'forex' | 'other';
  exchange?: string;
  currency?: string;
}

export interface Order {
  orderId: string;
  accountId: string;
  instrument: Instrument;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  parentId?: string;
  clientOrderId?: string;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderRequest {
  conid: number;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
  clientOrderId?: string;
  parentId?: string;
}

export interface ModifyOrderRequest {
  quantity?: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface OrderRepository {
  placeOrder(accountId: string, request: CreateOrderRequest): Promise<Order>;
  modifyOrder(accountId: string, orderId: string, request: ModifyOrderRequest): Promise<Order>;
  cancelOrder(accountId: string, orderId: string): Promise<void>;
  getOrders(accountId: string): Promise<Order[]>;
  getOrder(accountId: string, orderId: string): Promise<Order | null>;
}











