import type {
  CreateOrderRequest,
  Instrument,
  ModifyOrderRequest,
  Order,
  OrderRepository,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '../domain/order';
import type { GatewayClient } from './gateway-client';
import { createLogger } from './logger';

const log = createLogger('OrderRepo');

/** Raw order response from IBKR Client Portal API */
interface IbkrOrderResponse {
  orderId?: number | string;
  order_id?: number | string;
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
  price?: number | string;
  status?: string;
  order_status?: string;
  tif?: string;
  timeInForce?: string;
  parentId?: string;
  parent_id?: string;
  lastExecutionTime_r?: number;
  lastExecutionTime?: string;
}

/** Response when order requires confirmation */
interface IbkrOrderConfirmation {
  id: string;
  message: string[];
  isSuppressed?: boolean;
  messageIds?: string[];
}

/** Response after successful order placement */
interface IbkrOrderPlaced {
  order_id: string;
  order_status?: string;
  local_order_id?: string;
}

/** Reply endpoint response */
interface IbkrReplyResponse {
  order_id?: string;
  order_status?: string;
  text?: string;
  error?: string;
}

export class IbkrOrderRepository implements OrderRepository {
  constructor(private readonly client: GatewayClient) {}

  async placeOrder(accountId: string, request: CreateOrderRequest): Promise<Order> {
    const ibkrOrder: Record<string, unknown> = {
      acctId: accountId,
      conid: request.conid,
      orderType: this.toIbkrOrderType(request.type),
      side: request.side.toUpperCase(),
      quantity: request.quantity,
      tif: request.timeInForce ?? 'DAY',
    };

    // Add price for limit orders
    if (request.limitPrice !== undefined) {
      ibkrOrder.price = request.limitPrice;
    }

    // Add price for stop orders (IBKR uses 'price' for stop price too)
    if (request.type === 'stop' && request.stopPrice !== undefined) {
      ibkrOrder.price = request.stopPrice;
    }

    // Add client order ID if provided
    if (request.clientOrderId) {
      ibkrOrder.cOID = request.clientOrderId;
    }

    // Add parent ID for attached orders (e.g., stop-loss attached to a buy)
    if (request.parentId) {
      ibkrOrder.parentId = request.parentId;
    }

    log.debug(`Placing order: ${JSON.stringify(ibkrOrder)}`);

    // Initial order submission
    const response = await this.client.post<(IbkrOrderConfirmation | IbkrOrderPlaced)[]>(
      `/v1/api/iserver/account/${accountId}/orders`,
      { orders: [ibkrOrder] }
    );

    log.debug(`Order response: ${JSON.stringify(response)}`);

    // Handle the response - may require confirmation or be directly placed
    const result = await this.handleOrderResponse(response);

    return {
      orderId: result.orderId,
      accountId,
      instrument: { conid: request.conid, symbol: '', type: 'stock' },
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      limitPrice: request.limitPrice,
      stopPrice: request.stopPrice,
      timeInForce: request.timeInForce ?? 'DAY',
      clientOrderId: request.clientOrderId,
      parentId: request.parentId,
      status: result.status,
      filledQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private toIbkrOrderType(type: OrderType): string {
    switch (type) {
      case 'market': return 'MKT';
      case 'limit': return 'LMT';
      case 'stop': return 'STP';
    }
  }

  /**
   * Handle order response, auto-confirming any precautionary messages.
   * IBKR may return confirmation requests for various reasons (price constraints, etc.)
   */
  private async handleOrderResponse(
    response: (IbkrOrderConfirmation | IbkrOrderPlaced)[]
  ): Promise<{ orderId: string; status: OrderStatus }> {
    if (!response || response.length === 0) {
      throw new Error('Empty response from order placement');
    }

    const first = response[0];

    // Check if this is a confirmation request (has 'id' and 'message' fields)
    if ('id' in first && 'message' in first) {
      const confirmation = first as IbkrOrderConfirmation;
      log.info(`Order requires confirmation: ${confirmation.message.join('; ')}`);

      // Auto-confirm the order
      const replyResponse = await this.client.post<IbkrReplyResponse[]>(
        `/v1/api/iserver/reply/${confirmation.id}`,
        { confirmed: true }
      );

      log.debug(`Reply response: ${JSON.stringify(replyResponse)}`);

      // The reply may itself require further confirmation (nested confirmations)
      // Recursively handle until we get an order_id
      if (replyResponse && replyResponse.length > 0) {
        return this.handleOrderResponse(replyResponse as (IbkrOrderConfirmation | IbkrOrderPlaced)[]);
      }

      throw new Error('Order confirmation failed - no response');
    }

    // This is a successful order placement
    if ('order_id' in first) {
      const placed = first as IbkrOrderPlaced;
      log.info(`Order placed: ${placed.order_id}`);
      return {
        orderId: placed.order_id,
        status: this.mapStatus(placed.order_status ?? 'submitted', 0, 0),
      };
    }

    // Check for error
    if ('error' in first) {
      throw new Error(`Order failed: ${(first as { error: string }).error}`);
    }

    throw new Error(`Unexpected order response: ${JSON.stringify(first)}`);
  }

  async modifyOrder(
    accountId: string,
    orderId: string,
    request: ModifyOrderRequest
  ): Promise<Order> {
    log.debug(`Modifying order ${orderId}: ${JSON.stringify(request)}`);

    // First, fetch the existing order to get all required fields
    const existingOrder = await this.getOrder(accountId, orderId);
    if (!existingOrder) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Determine the price based on order type
    let price: number | undefined;
    if (existingOrder.type === 'stop') {
      price = request.stopPrice ?? existingOrder.stopPrice;
    } else if (existingOrder.type === 'limit') {
      price = request.limitPrice ?? existingOrder.limitPrice;
    }

    // IBKR requires the full order to be resent with modifications
    const modifyRequest: Record<string, unknown> = {
      conid: existingOrder.instrument.conid,
      side: existingOrder.side.toUpperCase(),
      orderType: this.toIbkrOrderType(existingOrder.type),
      quantity: request.quantity ?? existingOrder.quantity,
      tif: existingOrder.timeInForce,
    };

    if (price !== undefined) {
      modifyRequest.price = price;
    }

    log.debug(`Sending modify request: ${JSON.stringify(modifyRequest)}`);

    const response = await this.client.post<(IbkrOrderConfirmation | IbkrOrderPlaced)[]>(
      `/v1/api/iserver/account/${accountId}/order/${orderId}`,
      modifyRequest
    );

    log.debug(`Modify response: ${JSON.stringify(response)}`);

    // Handle confirmation if needed
    await this.handleOrderResponse(response);

    // Fetch the updated order
    const updatedOrder = await this.getOrder(accountId, orderId);
    if (!updatedOrder) {
      throw new Error(`Order ${orderId} not found after modification`);
    }

    return updatedOrder;
  }

  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    log.debug(`Cancelling order ${orderId} for account ${accountId}`);

    const response = await this.client.delete<{ msg?: string; error?: string }>(
      `/v1/api/iserver/account/${accountId}/order/${orderId}`
    );

    log.debug(`Cancel response: ${JSON.stringify(response)}`);

    if (response?.error) {
      throw new Error(`Failed to cancel order: ${response.error}`);
    }

    log.info(`Order ${orderId} cancelled`);
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
    const orderId = String(raw.orderId ?? raw.order_id ?? '');
    const conid = raw.conid ?? 0;
    const symbol = raw.ticker ?? raw.symbol ?? '';
    const totalQty = raw.totalSize ?? raw.quantity ?? 0;
    const filledQty = raw.filledQuantity ?? raw.filled_quantity ?? 0;
    const remainingQty = raw.remainingQuantity ?? raw.remaining_quantity ?? totalQty;
    const avgPrice = raw.avgPrice ?? raw.avg_price;
    // price can be string ("100.00") or number
    const priceValue = raw.price !== undefined ? parseFloat(String(raw.price)) : undefined;
    const statusRaw = raw.status ?? raw.order_status ?? '';
    const sideRaw = raw.side ?? '';
    const typeRaw = raw.orderType ?? raw.order_type ?? '';
    const orderType = this.mapOrderType(typeRaw);

    // For stop orders, price is the stop price; for limit orders, it's the limit price
    const limitPrice = orderType === 'limit' ? priceValue : undefined;
    const stopPrice = orderType === 'stop' ? priceValue : undefined;

    // Parse time in force
    const tifRaw = raw.tif ?? raw.timeInForce ?? 'DAY';
    const timeInForce: TimeInForce = tifRaw.toUpperCase() === 'GTC' ? 'GTC' : 'DAY';

    // Parse parent ID for attached orders
    const parentId = raw.parentId ?? raw.parent_id;

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
      type: orderType,
      quantity: totalQty > 0 ? totalQty : filledQty + remainingQty,
      limitPrice,
      stopPrice,
      timeInForce,
      parentId,
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
    if (t === 'MKT' || t === 'MARKET') return 'market';
    if (t === 'STP' || t === 'STOP') return 'stop';
    return 'limit';
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




