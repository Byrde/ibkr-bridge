import { IbkrOrderRepository } from '../../src/infrastructure/ibkr-order-repository';
import type { GatewayClient } from '../../src/infrastructure/gateway-client';

describe('IbkrOrderRepository', () => {
  let repository: IbkrOrderRepository;
  let mockClient: jest.Mocked<GatewayClient>;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      getBaseUrl: jest.fn(),
      setSessionManager: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;

    repository = new IbkrOrderRepository(mockClient);
  });

  describe('getOrders', () => {
    it('returns empty array when no orders', async () => {
      mockClient.get.mockResolvedValue({ orders: [] });

      const orders = await repository.getOrders('DU123456');

      expect(orders).toEqual([]);
      expect(mockClient.get).toHaveBeenCalledWith('/v1/api/iserver/account/orders');
    });

    it('maps IBKR order response to domain Order', async () => {
      mockClient.get.mockResolvedValue({
        orders: [
          {
            orderId: '12345',
            acct: 'DU123456',
            conid: 265598,
            ticker: 'AAPL',
            side: 'BUY',
            orderType: 'LMT',
            totalSize: 100,
            filledQuantity: 50,
            remainingQuantity: 50,
            avgPrice: 165.0,
            price: 166.0,
            status: 'Submitted',
            lastExecutionTime_r: 1702742400000,
          },
        ],
      });

      const orders = await repository.getOrders('DU123456');

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        orderId: '12345',
        accountId: 'DU123456',
        instrument: {
          conid: 265598,
          symbol: 'AAPL',
          type: 'stock',
        },
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 166.0,
        status: 'submitted',
        filledQuantity: 50,
        avgFillPrice: 165.0,
      });
    });

    it('handles alternative field names (order_id, account, etc)', async () => {
      mockClient.get.mockResolvedValue({
        orders: [
          {
            order_id: '67890',
            account: 'DU123456',
            conid: 8314,
            symbol: 'IBM',
            side: 'SELL',
            order_type: 'MKT',
            quantity: 50,
            filled_quantity: 50,
            remaining_quantity: 0,
            avg_price: 142.5,
            order_status: 'Filled',
          },
        ],
      });

      const orders = await repository.getOrders('DU123456');

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        orderId: '67890',
        accountId: 'DU123456',
        instrument: {
          conid: 8314,
          symbol: 'IBM',
        },
        side: 'sell',
        type: 'market',
        quantity: 50,
        status: 'filled',
        filledQuantity: 50,
        avgFillPrice: 142.5,
      });
    });

    it('filters orders by account ID', async () => {
      mockClient.get.mockResolvedValue({
        orders: [
          { orderId: '1', acct: 'DU123456', conid: 100, side: 'BUY', status: 'Submitted' },
          { orderId: '2', acct: 'DU999999', conid: 200, side: 'SELL', status: 'Submitted' },
          { orderId: '3', acct: '', conid: 300, side: 'BUY', status: 'Submitted' }, // Empty account matches all
        ],
      });

      const orders = await repository.getOrders('DU123456');

      expect(orders).toHaveLength(2);
      expect(orders.map((o) => o.orderId)).toEqual(['1', '3']);
    });

    it('maps various order statuses correctly', async () => {
      mockClient.get.mockResolvedValue({
        orders: [
          { orderId: '1', acct: 'DU123456', status: 'Submitted', filledQuantity: 0, remainingQuantity: 100 },
          { orderId: '2', acct: 'DU123456', status: 'Cancelled', filledQuantity: 0, remainingQuantity: 0 },
          { orderId: '3', acct: 'DU123456', status: 'Rejected', filledQuantity: 0, remainingQuantity: 0 },
          { orderId: '4', acct: 'DU123456', status: 'Filled', filledQuantity: 100, remainingQuantity: 0 },
          { orderId: '5', acct: 'DU123456', status: 'PreSubmitted', filledQuantity: 0, remainingQuantity: 100 },
          { orderId: '6', acct: 'DU123456', status: 'PartiallyFilled', filledQuantity: 50, remainingQuantity: 50 },
        ],
      });

      const orders = await repository.getOrders('DU123456');

      expect(orders.map((o) => o.status)).toEqual([
        'submitted',
        'cancelled',
        'rejected',
        'filled',
        'pending',
        'partially_filled',
      ]);
    });

    it('infers partially_filled status from quantities when status unclear', async () => {
      mockClient.get.mockResolvedValue({
        orders: [
          { orderId: '1', acct: 'DU123456', status: 'Active', filledQuantity: 25, remainingQuantity: 75 },
        ],
      });

      const orders = await repository.getOrders('DU123456');

      expect(orders[0].status).toBe('partially_filled');
    });

    it('handles missing orders array gracefully', async () => {
      mockClient.get.mockResolvedValue({});

      const orders = await repository.getOrders('DU123456');

      expect(orders).toEqual([]);
    });
  });
});




