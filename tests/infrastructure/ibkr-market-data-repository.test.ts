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

  describe('searchInstruments', () => {
    it('returns empty array when response is empty', async () => {
      mockClient.get.mockResolvedValue([]);

      const results = await repository.searchInstruments('AAPL');

      expect(results).toEqual([]);
      expect(mockClient.get).toHaveBeenCalledWith(
        '/v1/api/iserver/secdef/search?symbol=AAPL'
      );
    });

    it('returns empty array when response is not an array', async () => {
      mockClient.get.mockResolvedValue({ error: 'something' });

      const results = await repository.searchInstruments('INVALID');

      expect(results).toEqual([]);
    });

    it('maps IBKR search response with sections to domain model', async () => {
      mockClient.get.mockResolvedValue([
        {
          conid: 265598,
          companyName: 'APPLE INC',
          symbol: 'AAPL',
          sections: [
            {
              conid: '265598',
              secType: 'STK',
              listingExchange: 'NASDAQ',
            },
          ],
        },
      ]);

      const results = await repository.searchInstruments('AAPL');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        conid: 265598,
        symbol: 'AAPL',
        description: 'APPLE INC',
        type: 'stock',
        exchange: 'NASDAQ',
      });
    });

    it('handles multiple sections per instrument', async () => {
      mockClient.get.mockResolvedValue([
        {
          conid: 8314,
          companyName: 'IBM CORP',
          symbol: 'IBM',
          sections: [
            { conid: '8314', secType: 'STK', listingExchange: 'NYSE' },
            { conid: '123456', secType: 'OPT', listingExchange: 'CBOE' },
          ],
        },
      ]);

      const results = await repository.searchInstruments('IBM');

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        conid: 8314,
        type: 'stock',
        exchange: 'NYSE',
      });
      expect(results[1]).toMatchObject({
        conid: 123456,
        type: 'option',
        exchange: 'CBOE',
      });
    });

    it('falls back to top-level conid when no sections exist', async () => {
      mockClient.get.mockResolvedValue([
        {
          conid: 12345,
          symbol: 'TEST',
          companyHeader: 'Test Company',
        },
      ]);

      const results = await repository.searchInstruments('TEST');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        conid: 12345,
        symbol: 'TEST',
        description: 'Test Company',
        type: 'stock',
        exchange: '',
      });
    });

    it('skips items without valid conid', async () => {
      mockClient.get.mockResolvedValue([
        { symbol: 'NOCONID', companyName: 'No Conid Corp' },
        { conid: 0, symbol: 'ZEROCONID', companyName: 'Zero Conid Corp' },
        { conid: 99999, symbol: 'VALID', companyName: 'Valid Corp' },
      ]);

      const results = await repository.searchInstruments('TEST');

      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('VALID');
    });

    it('maps various security types correctly', async () => {
      mockClient.get.mockResolvedValue([
        {
          conid: 1,
          symbol: 'STK',
          sections: [{ conid: '1', secType: 'STK', exchange: 'NYSE' }],
        },
        {
          conid: 2,
          symbol: 'FUT',
          sections: [{ conid: '2', secType: 'FUT', exchange: 'CME' }],
        },
        {
          conid: 3,
          symbol: 'CASH',
          sections: [{ conid: '3', secType: 'CASH', exchange: 'IDEALPRO' }],
        },
        {
          conid: 4,
          symbol: 'IND',
          sections: [{ conid: '4', secType: 'IND', exchange: 'CBOE' }],
        },
        {
          conid: 5,
          symbol: 'BOND',
          sections: [{ conid: '5', secType: 'BOND', exchange: 'SMART' }],
        },
        {
          conid: 6,
          symbol: 'FUND',
          sections: [{ conid: '6', secType: 'FUND', exchange: 'ARCAEDGE' }],
        },
        {
          conid: 7,
          symbol: 'WAR',
          sections: [{ conid: '7', secType: 'WAR', exchange: 'SMART' }],
        },
        {
          conid: 8,
          symbol: 'CUSTOM',
          sections: [{ conid: '8', secType: 'CUSTOM', exchange: 'OTHER' }],
        },
      ]);

      const results = await repository.searchInstruments('TEST');

      expect(results.map((r) => r.type)).toEqual([
        'stock',
        'future',
        'forex',
        'index',
        'bond',
        'fund',
        'warrant',
        'custom',
      ]);
    });

    it('URL-encodes the query parameter', async () => {
      mockClient.get.mockResolvedValue([]);

      await repository.searchInstruments('BRK B');

      expect(mockClient.get).toHaveBeenCalledWith(
        '/v1/api/iserver/secdef/search?symbol=BRK%20B'
      );
    });

    it('uses exchange from section when listingExchange is not available', async () => {
      mockClient.get.mockResolvedValue([
        {
          conid: 1,
          symbol: 'TEST',
          sections: [{ conid: '1', secType: 'STK', exchange: 'SMART' }],
        },
      ]);

      const results = await repository.searchInstruments('TEST');

      expect(results[0].exchange).toBe('SMART');
    });

    it('handles multiple search results', async () => {
      mockClient.get.mockResolvedValue([
        {
          conid: 265598,
          symbol: 'AAPL',
          companyName: 'APPLE INC',
          sections: [{ conid: '265598', secType: 'STK', listingExchange: 'NASDAQ' }],
        },
        {
          conid: 76792991,
          symbol: 'AAPL',
          companyName: 'APPLE INC - LSE',
          sections: [{ conid: '76792991', secType: 'STK', listingExchange: 'LSE' }],
        },
      ]);

      const results = await repository.searchInstruments('AAPL');

      expect(results).toHaveLength(2);
      expect(results[0].exchange).toBe('NASDAQ');
      expect(results[1].exchange).toBe('LSE');
    });
  });

  describe('getQuote', () => {
    it('returns quote with all fields mapped correctly', async () => {
      mockClient.get.mockResolvedValue([
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

      const quote = await repository.getQuote(265598);

      expect(quote).not.toBeNull();
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
        '/v1/api/iserver/marketdata/snapshot?conids=265598&fields=31,55,84,85,86,88,7762'
      );
    });

    it('returns null when response is empty array', async () => {
      mockClient.get.mockResolvedValue([]);

      const quote = await repository.getQuote(265598);

      expect(quote).toBeNull();
    });

    it('returns null when response is not an array', async () => {
      mockClient.get.mockResolvedValue({ error: 'something' });

      const quote = await repository.getQuote(265598);

      expect(quote).toBeNull();
    });
  });

  describe('getQuotes', () => {
    it('returns multiple quotes for multiple conids', async () => {
      mockClient.get.mockResolvedValue([
        { conid: 265598, '55': 'AAPL', '31': '168.00', _updated: 1712596911593 },
        { conid: 8314, '55': 'IBM', '31': '185.50', _updated: 1712596911594 },
      ]);

      const quotes = await repository.getQuotes([265598, 8314]);

      expect(quotes).toHaveLength(2);
      expect(quotes[0].symbol).toBe('AAPL');
      expect(quotes[1].symbol).toBe('IBM');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/v1/api/iserver/marketdata/snapshot?conids=265598,8314&fields=31,55,84,85,86,88,7762'
      );
    });

    it('returns empty array for empty conids list', async () => {
      const quotes = await repository.getQuotes([]);

      expect(quotes).toEqual([]);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('handles partial quote data gracefully', async () => {
      mockClient.get.mockResolvedValue([
        { conid: 265598, '55': 'AAPL', _updated: 1712596911593 },
      ]);

      const quotes = await repository.getQuotes([265598]);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toEqual({
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
  });
});
