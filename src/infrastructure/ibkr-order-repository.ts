import type {
  CreateOrderRequest,
  Instrument,
  ModifyOrderRequest,
  Order,
  OrderRepository,
  OrderSide,
  OrderStatus,
  OrderType,
} from '../domain/order';
import type { GatewayClient } from './gateway-client';

/** Raw order response from IBKR Client Portal API */
interface IbkrOrderResponse {
  orderId?: string;
  order_id?: string;
  acct?: string;
  account?: string;
  conid?: number;
  ticker?: string;
  symbol?: string;
  side?: string;
  orderType?: string;
  order_type?: string;
  totalSize?: number;
  quantity?: number;
  remainingQuantity?: number;
  remaining_quantity?: number;
  filledQuantity?: number;
  filled_quantity?: number;
  avgPrice?: number;
  avg_price?: number;
  price?: number;
  status?: string;
  order_status?: string;
  lastExecutionTime_r?: number;
  lastExecutionTime?: string;
}

export class IbkrOrderRepository implements OrderRepository {
  constructor(private readonly client: GatewayClient) {}

  async placeOrder(accountId: string, request: CreateOrderRequest): Promise<Order> {
    const ibkrOrder = {
      acctId: accountId,
      conid: request.conid,
      orderType: request.type === 'market' ? 'MKT' : 'LMT',
      side: request.side.toUpperCase(),
      quantity: request.quantity,
      price: request.limitPrice,
      tif: 'DAY',
    };

    const response = await this.client.post<{ order_id: string }[]>(
      `/v1/api/iserver/account/${accountId}/orders`,
      { orders: [ibkrOrder] }
    );

    // TODO: Map response to domain Order
    return {
      orderId: response[0]?.order_id ?? '',
      accountId,
      instrument: { conid: request.conid, symbol: '', type: 'stock' },
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      limitPrice: request.limitPrice,
      status: 'submitted',
      filledQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async modifyOrder(
    accountId: string,
    orderId: string,
    request: ModifyOrderRequest
  ): Promise<Order> {
    await this.client.post(`/v1/api/iserver/account/${accountId}/order/${orderId}`, request);

    // TODO: Fetch and return updated order
    return {} as Order;
  }

  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    await this.client.delete(`/v1/api/iserver/account/${accountId}/order/${orderId}`);
  }

  async getOrders(accountId: string): Promise<Order[]> {
    const response = await this.client.get<{ orders: IbkrOrderResponse[] }>(
      '/v1/api/iserver/account/orders'
    );

    const orders = response.orders ?? [];
    return orders
      .filter((o) => {
        const acct = o.acct ?? o.account ?? '';
        return acct === accountId || acct === '';
      })
      .map((o) => this.mapToOrder(o, accountId));
  }

  private mapToOrder(raw: IbkrOrderResponse, accountId: string): Order {
    const orderId = raw.orderId ?? raw.order_id ?? '';
    const conid = raw.conid ?? 0;
    const symbol = raw.ticker ?? raw.symbol ?? '';
    const totalQty = raw.totalSize ?? raw.quantity ?? 0;
    const filledQty = raw.filledQuantity ?? raw.filled_quantity ?? 0;
    const remainingQty = raw.remainingQuantity ?? raw.remaining_quantity ?? totalQty;
    const avgPrice = raw.avgPrice ?? raw.avg_price;
    const limitPrice = raw.price;
    const statusRaw = raw.status ?? raw.order_status ?? '';
    const sideRaw = raw.side ?? '';
    const typeRaw = raw.orderType ?? raw.order_type ?? '';

    // Parse timestamps
    let updatedAt = new Date();
    if (raw.lastExecutionTime_r) {
      updatedAt = new Date(raw.lastExecutionTime_r);
    } else if (raw.lastExecutionTime) {
      updatedAt = new Date(raw.lastExecutionTime);
    }

    const instrument: Instrument = {
      conid,
      symbol,
      type: 'stock', // Default; IBKR doesn't always include asset type in orders response
    };

    return {
      orderId,
      accountId: raw.acct ?? raw.account ?? accountId,
      instrument,
      side: this.mapSide(sideRaw),
      type: this.mapOrderType(typeRaw),
      quantity: totalQty > 0 ? totalQty : filledQty + remainingQty,
      limitPrice,
      status: this.mapStatus(statusRaw, filledQty, remainingQty),
      filledQuantity: filledQty,
      avgFillPrice: avgPrice,
      createdAt: updatedAt, // IBKR doesn't expose creation time separately
      updatedAt,
    };
  }

  private mapSide(side: string): OrderSide {
    const s = side.toUpperCase();
    return s === 'SELL' || s === 'S' ? 'sell' : 'buy';
  }

  private mapOrderType(type: string): OrderType {
    const t = type.toUpperCase();
    return t === 'MKT' || t === 'MARKET' ? 'market' : 'limit';
  }

  private mapStatus(status: string, filledQty: number, remainingQty: number): OrderStatus {
    const s = status.toLowerCase();

    if (s.includes('cancel')) return 'cancelled';
    if (s.includes('reject')) return 'rejected';
    if (s.includes('partial')) return 'partially_filled';
    if (s.includes('fill') || s === 'filled') {
      return remainingQty === 0 ? 'filled' : 'partially_filled';
    }
    if (s.includes('pending') || s.includes('presubmit')) return 'pending';
    if (s.includes('submit') || s === 'submitted') return 'submitted';

    // Infer from quantities if status is unclear
    if (filledQty > 0 && remainingQty > 0) return 'partially_filled';
    if (filledQty > 0 && remainingQty === 0) return 'filled';

    return 'submitted';
  }

  async getOrder(accountId: string, orderId: string): Promise<Order | null> {
    const orders = await this.getOrders(accountId);
    return orders.find((o) => o.orderId === orderId) ?? null;
  }
}



