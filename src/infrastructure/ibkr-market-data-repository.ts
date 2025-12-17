import type {
  InstrumentSearchResult,
  MarketDataRepository,
  Quote,
} from '../domain/market-data';
import type { GatewayClient } from './gateway-client';

/** Raw contract section from IBKR secdef/search response */
interface IbkrContractSection {
  conid?: string;
  secType?: string;
  exchange?: string;
  listingExchange?: string;
}

/** Raw instrument response from IBKR secdef/search endpoint */
interface IbkrSearchResult {
  conid?: number;
  companyHeader?: string;
  companyName?: string;
  symbol?: string;
  description?: string;
  restricted?: string | null;
  fop?: string | null;
  opt?: string | null;
  war?: string | null;
  sections?: IbkrContractSection[];
}

export class IbkrMarketDataRepository implements MarketDataRepository {
  constructor(private readonly client: GatewayClient) {}

  async searchInstruments(query: string): Promise<InstrumentSearchResult[]> {
    const response = await this.client.get<IbkrSearchResult[]>(
      `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(query)}`
    );

    if (!Array.isArray(response)) {
      return [];
    }

    return response.flatMap((item) => this.mapSearchResult(item));
  }

  private mapSearchResult(raw: IbkrSearchResult): InstrumentSearchResult[] {
    const results: InstrumentSearchResult[] = [];
    const symbol = raw.symbol ?? '';
    const description = raw.companyName ?? raw.description ?? raw.companyHeader ?? '';

    // If sections exist, create an entry for each tradeable contract
    if (raw.sections && raw.sections.length > 0) {
      for (const section of raw.sections) {
        const conid = section.conid ? parseInt(section.conid, 10) : raw.conid ?? 0;
        if (conid === 0) continue;

        results.push({
          conid,
          symbol,
          description,
          type: this.mapSecurityType(section.secType),
          exchange: section.listingExchange ?? section.exchange ?? '',
        });
      }
    } else if (raw.conid) {
      // Fallback: use top-level conid if no sections
      results.push({
        conid: raw.conid,
        symbol,
        description,
        type: 'stock',
        exchange: '',
      });
    }

    return results;
  }

  private mapSecurityType(secType?: string): string {
    if (!secType) return 'stock';
    const t = secType.toUpperCase();
    switch (t) {
      case 'STK':
        return 'stock';
      case 'OPT':
        return 'option';
      case 'FUT':
        return 'future';
      case 'CASH':
      case 'FX':
        return 'forex';
      case 'IND':
        return 'index';
      case 'BOND':
        return 'bond';
      case 'FUND':
      case 'ETF':
        return 'fund';
      case 'WAR':
        return 'warrant';
      default:
        return secType.toLowerCase();
    }
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



