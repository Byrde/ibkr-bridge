import type { MarketDataRepository, Quote } from '../domain/market-data';
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

  async getQuoteBySymbol(symbol: string): Promise<Quote | null> {
    const conid = await this.resolveConid(symbol);
    if (!conid) {
      return null;
    }

    // Fields: 31=last, 55=symbol, 84=bid, 85=askSize, 86=ask, 88=bidSize, 7762=volume
    const response = await this.client.get<IbkrSnapshotResponse[]>(
      `/v1/api/iserver/marketdata/snapshot?conids=${conid}&fields=31,55,84,85,86,88,7762`
    );

    if (!Array.isArray(response) || response.length === 0) {
      return null;
    }

    return this.mapSnapshotToQuote(response[0]);
  }

  private async resolveConid(symbol: string): Promise<number | null> {
    const response = await this.client.get<IbkrSearchResult[]>(
      `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`
    );

    if (!Array.isArray(response) || response.length === 0) {
      return null;
    }

    // Find exact symbol match, prefer STK (stock) type
    for (const item of response) {
      if (item.symbol?.toUpperCase() !== symbol.toUpperCase()) continue;

      if (item.sections && item.sections.length > 0) {
        // Prefer STK section
        const stkSection = item.sections.find((s) => s.secType === 'STK');
        const section = stkSection ?? item.sections[0];
        const conid = this.parseConid(section.conid);
        if (conid) return conid;
      }

      const conid = this.parseConid(item.conid);
      if (conid) return conid;
    }

    // Fallback: first result with a conid
    const first = response[0];
    if (first.sections && first.sections.length > 0) {
      const conid = this.parseConid(first.sections[0].conid);
      if (conid) return conid;
    }
    return this.parseConid(first.conid) ?? null;
  }

  private parseConid(value: string | number | undefined): number | null {
    if (value === undefined) return null;
    if (typeof value === 'number') return value;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
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
    const cleaned = value.replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  }
}



