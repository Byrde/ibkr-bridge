import type {
  InstrumentSearchResult,
  MarketDataRepository,
  Quote,
} from '../domain/market-data';
import type { GatewayClient } from './gateway-client';

/** Raw contract section from IBKR secdef/search response */
interface IbkrContractSection {
  conid?: string | number;
  secType?: string;
  exchange?: string;
  listingExchange?: string;
}

/**
 * IBKR market data snapshot response.
 * Field keys are numeric strings (e.g., "31", "84").
 * Values may be strings with commas for thousands separators.
 */
interface IbkrSnapshotResponse {
  conid: number;
  conidEx?: string;
  // Field 31: Last price
  '31'?: string;
  // Field 84: Bid price
  '84'?: string;
  // Field 85: Ask size
  '85'?: string;
  // Field 86: Ask price
  '86'?: string;
  // Field 88: Bid size
  '88'?: string;
  // Field 7762: Volume
  '7762'?: string;
  // Symbol (field 55)
  '55'?: string;
  _updated?: number;
}

/** Raw instrument response from IBKR secdef/search endpoint */
interface IbkrSearchResult {
  conid?: string | number;
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

    // Skip entries without a symbol
    if (!symbol) {
      return results;
    }

    const topLevelConid = this.parseConid(raw.conid) ?? 0;

    // If sections exist, create an entry for each tradeable contract
    if (raw.sections && raw.sections.length > 0) {
      for (const section of raw.sections) {
        const conid = this.parseConid(section.conid) ?? topLevelConid;
        if (conid === 0) continue;

        results.push({
          conid,
          symbol,
          description,
          type: this.mapSecurityType(section.secType),
          exchange: section.listingExchange ?? section.exchange ?? '',
        });
      }
    } else if (topLevelConid > 0) {
      // Fallback: use top-level conid if no sections
      results.push({
        conid: topLevelConid,
        symbol,
        description,
        type: 'stock',
        exchange: '',
      });
    }

    return results;
  }

  private parseConid(value: string | number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'number') return value;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
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
    if (conids.length === 0) {
      return [];
    }

    const conidList = conids.join(',');
    // Fields: 31=last, 55=symbol, 84=bid, 85=askSize, 86=ask, 88=bidSize, 7762=volume
    const response = await this.client.get<IbkrSnapshotResponse[]>(
      `/v1/api/iserver/marketdata/snapshot?conids=${conidList}&fields=31,55,84,85,86,88,7762`
    );

    if (!Array.isArray(response)) {
      return [];
    }

    return response
      .filter((item) => item.conid !== undefined)
      .map((item) => this.mapSnapshotToQuote(item));
  }

  private mapSnapshotToQuote(raw: IbkrSnapshotResponse): Quote {
    return {
      conid: raw.conid,
      symbol: raw['55'] ?? '',
      lastPrice: this.parseNumber(raw['31']),
      bidPrice: this.parseNumber(raw['84']),
      askPrice: this.parseNumber(raw['86']),
      bidSize: this.parseNumber(raw['88']),
      askSize: this.parseNumber(raw['85']),
      volume: this.parseNumber(raw['7762']),
      timestamp: raw._updated ? new Date(raw._updated) : new Date(),
    };
  }

  private parseNumber(value: string | undefined): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    // Remove commas used as thousands separators
    const cleaned = value.replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  }
}



