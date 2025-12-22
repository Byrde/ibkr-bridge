import { IbkrMarketDataRepository } from '../../src/infrastructure/ibkr-market-data-repository';
import type { GatewayClient } from '../../src/infrastructure/gateway-client';

describe('IbkrMarketDataRepository', () => {
  let repository: IbkrMarketDataRepository;
  let mockClient: jest.Mocked<GatewayClient>;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      getBaseUrl: jest.fn(),
      setSessionManager: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;

    repository = new IbkrMarketDataRepository(mockClient);
  });

  describe('getQuoteBySymbol', () => {
    it('resolves symbol and returns quote', async () => {
      mockClient.get
        .mockResolvedValueOnce([
          {
            conid: 265598,
            symbol: 'AAPL',
            companyName: 'APPLE INC',
            sections: [{ conid: '265598', secType: 'STK', listingExchange: 'NASDAQ' }],
          },
        ])
        .mockResolvedValueOnce([
          {
            conid: 265598,
            '55': 'AAPL',
            '31': '168.42',
            '84': '168.41',
            '86': '168.43',
            '88': '1,300',
            '85': '600',
            '7762': '52,345,678',
            _updated: 1712596911593,
          },
        ]);

      const quote = await repository.getQuoteBySymbol('AAPL');

      expect(quote).toEqual({
        conid: 265598,
        symbol: 'AAPL',
        lastPrice: 168.42,
        bidPrice: 168.41,
        askPrice: 168.43,
        bidSize: 1300,
        askSize: 600,
        volume: 52345678,
        timestamp: new Date(1712596911593),
      });
      expect(mockClient.get).toHaveBeenCalledWith(
        '/v1/api/iserver/secdef/search?symbol=AAPL'
      );
      expect(mockClient.get).toHaveBeenCalledWith(
        '/v1/api/iserver/marketdata/snapshot?conids=265598&fields=31,55,84,85,86,88,7762'
      );
    });

    it('returns null when symbol not found', async () => {
      mockClient.get.mockResolvedValue([]);

      const quote = await repository.getQuoteBySymbol('INVALID');

      expect(quote).toBeNull();
    });

    it('returns null when search returns non-array', async () => {
      mockClient.get.mockResolvedValue({ error: 'something' });

      const quote = await repository.getQuoteBySymbol('INVALID');

      expect(quote).toBeNull();
    });

    it('returns null when quote snapshot is empty', async () => {
      mockClient.get
        .mockResolvedValueOnce([
          { conid: 265598, symbol: 'AAPL', sections: [{ conid: '265598', secType: 'STK' }] },
        ])
        .mockResolvedValueOnce([]);

      const quote = await repository.getQuoteBySymbol('AAPL');

      expect(quote).toBeNull();
    });

    it('prefers STK section over other types', async () => {
      mockClient.get
        .mockResolvedValueOnce([
          {
            conid: 1,
            symbol: 'AAPL',
            sections: [
              { conid: '999', secType: 'OPT', listingExchange: 'CBOE' },
              { conid: '265598', secType: 'STK', listingExchange: 'NASDAQ' },
            ],
          },
        ])
        .mockResolvedValueOnce([
          { conid: 265598, '55': 'AAPL', '31': '168.00', _updated: 1712596911593 },
        ]);

      const quote = await repository.getQuoteBySymbol('AAPL');

      expect(quote?.conid).toBe(265598);
      expect(mockClient.get).toHaveBeenLastCalledWith(
        '/v1/api/iserver/marketdata/snapshot?conids=265598&fields=31,55,84,85,86,88,7762'
      );
    });

    it('matches symbol case-insensitively', async () => {
      mockClient.get
        .mockResolvedValueOnce([
          { conid: 265598, symbol: 'AAPL', sections: [{ conid: '265598', secType: 'STK' }] },
        ])
        .mockResolvedValueOnce([
          { conid: 265598, '55': 'AAPL', '31': '168.00', _updated: 1712596911593 },
        ]);

      const quote = await repository.getQuoteBySymbol('aapl');

      expect(quote?.symbol).toBe('AAPL');
    });

    it('falls back to first result if exact match not found', async () => {
      mockClient.get
        .mockResolvedValueOnce([
          { conid: 12345, symbol: 'AAPLX', sections: [{ conid: '12345', secType: 'STK' }] },
        ])
        .mockResolvedValueOnce([
          { conid: 12345, '55': 'AAPLX', '31': '50.00', _updated: 1712596911593 },
        ]);

      const quote = await repository.getQuoteBySymbol('AAPL');

      expect(quote?.conid).toBe(12345);
    });

    it('URL-encodes the symbol', async () => {
      mockClient.get.mockResolvedValue([]);

      await repository.getQuoteBySymbol('BRK B');

      expect(mockClient.get).toHaveBeenCalledWith(
        '/v1/api/iserver/secdef/search?symbol=BRK%20B'
      );
    });

    it('handles partial quote data gracefully', async () => {
      mockClient.get
        .mockResolvedValueOnce([
          { conid: 265598, symbol: 'AAPL', sections: [{ conid: '265598', secType: 'STK' }] },
        ])
        .mockResolvedValueOnce([
          { conid: 265598, '55': 'AAPL', _updated: 1712596911593 },
        ]);

      const quote = await repository.getQuoteBySymbol('AAPL');

      expect(quote).toEqual({
        conid: 265598,
        symbol: 'AAPL',
        lastPrice: undefined,
        bidPrice: undefined,
        askPrice: undefined,
        bidSize: undefined,
        askSize: undefined,
        volume: undefined,
        timestamp: new Date(1712596911593),
      });
    });

    it('uses top-level conid when no sections exist', async () => {
      mockClient.get
        .mockResolvedValueOnce([{ conid: 12345, symbol: 'TEST' }])
        .mockResolvedValueOnce([
          { conid: 12345, '55': 'TEST', '31': '100.00', _updated: 1712596911593 },
        ]);

      const quote = await repository.getQuoteBySymbol('TEST');

      expect(quote?.conid).toBe(12345);
    });
  });
});
