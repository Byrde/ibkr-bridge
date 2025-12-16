import type {
  CreateOrderRequest,
  ModifyOrderRequest,
  Order,
  OrderRepository,
} from '../domain/order';
import type { GatewayClient } from './gateway-client';

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

  async getOrders(_accountId: string): Promise<Order[]> {
    await this.client.get<{ orders: unknown[] }>('/v1/api/iserver/account/orders');

    // TODO: Map response to domain Orders
    return [];
  }

  async getOrder(accountId: string, orderId: string): Promise<Order | null> {
    const orders = await this.getOrders(accountId);
    return orders.find((o) => o.orderId === orderId) ?? null;
  }
}



