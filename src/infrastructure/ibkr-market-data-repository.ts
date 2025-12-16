import type {
  InstrumentSearchResult,
  MarketDataRepository,
  Quote,
} from '../domain/market-data';
import type { GatewayClient } from './gateway-client';

export class IbkrMarketDataRepository implements MarketDataRepository {
  constructor(private readonly client: GatewayClient) {}

  async searchInstruments(query: string): Promise<InstrumentSearchResult[]> {
    await this.client.get<unknown[]>(
      `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(query)}`
    );

    // TODO: Map IBKR response to domain model
    return [];
  }

  async getQuote(conid: number): Promise<Quote | null> {
    const quotes = await this.getQuotes([conid]);
    return quotes[0] ?? null;
  }

  async getQuotes(conids: number[]): Promise<Quote[]> {
    const conidList = conids.join(',');
    await this.client.get<unknown[]>(
      `/v1/api/iserver/marketdata/snapshot?conids=${conidList}&fields=31,84,85,86,87,88`
    );

    // TODO: Map IBKR response to domain Quotes
    return [];
  }
}



