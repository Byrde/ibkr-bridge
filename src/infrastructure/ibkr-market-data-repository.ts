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
  private static readonly SNAPSHOT_FIELDS = '31,55,84,85,86,88,7762';
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 250;

  constructor(private readonly client: GatewayClient) {}

  async getQuoteBySymbol(symbol: string, secType?: string): Promise<Quote | null> {
    const conid = await this.resolveConid(symbol, secType);
    if (!conid) {
      return null;
    }

    // IBKR requires "priming" - first request may return incomplete data.
    // Retry until we get price data or exhaust retries.
    for (let attempt = 0; attempt < IbkrMarketDataRepository.MAX_RETRIES; attempt++) {
      const response = await this.fetchSnapshot(conid);
      if (!response) {
        return null;
      }

      const quote = this.mapSnapshotToQuote(response);
      if (this.isQuoteComplete(quote)) {
        return quote;
      }

      // Wait before retry
      await this.delay(IbkrMarketDataRepository.RETRY_DELAY_MS);
    }

    // Return whatever we have after max retries
    const finalResponse = await this.fetchSnapshot(conid);
    return finalResponse ? this.mapSnapshotToQuote(finalResponse) : null;
  }

  private async fetchSnapshot(conid: number): Promise<IbkrSnapshotResponse | null> {
    const response = await this.client.get<IbkrSnapshotResponse[]>(
      `/v1/api/iserver/marketdata/snapshot?conids=${conid}&fields=${IbkrMarketDataRepository.SNAPSHOT_FIELDS}`
    );

    if (!Array.isArray(response) || response.length === 0) {
      return null;
    }

    return response[0];
  }

  private isQuoteComplete(quote: Quote): boolean {
    // Consider complete if we have at least one price field
    return quote.lastPrice !== undefined || quote.bidPrice !== undefined || quote.askPrice !== undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async resolveConid(symbol: string, preferredSecType?: string): Promise<number | null> {
    const response = await this.client.get<IbkrSearchResult[]>(
      `/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`
    );

    if (!Array.isArray(response) || response.length === 0) {
      return null;
    }

    // Find exact symbol match
    for (const item of response) {
      if (item.symbol?.toUpperCase() !== symbol.toUpperCase()) continue;

      if (item.sections && item.sections.length > 0) {
        let section;
        if (preferredSecType) {
          // If secType specified, find exact match
          section = item.sections.find((s) => s.secType === preferredSecType.toUpperCase());
          if (!section) continue; // Skip if preferred type not found
        } else {
          // Default: prefer STK (stock) type, fallback to first
          const stkSection = item.sections.find((s) => s.secType === 'STK');
          section = stkSection ?? item.sections[0];
        }
        const conid = this.parseConid(section.conid);
        if (conid) return conid;
      }

      const conid = this.parseConid(item.conid);
      if (conid) return conid;
    }

    // Fallback: first result with a conid
    const first = response[0];
    if (first.sections && first.sections.length > 0) {
      if (preferredSecType) {
        const section = first.sections.find((s) => s.secType === preferredSecType.toUpperCase());
        if (section) {
          const conid = this.parseConid(section.conid);
          if (conid) return conid;
        }
      } else {
        const conid = this.parseConid(first.sections[0].conid);
        if (conid) return conid;
      }
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
      bidSize: this.parseNumber(raw['88']),
      askPrice: this.parseNumber(raw['86']),
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



