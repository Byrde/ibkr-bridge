export interface Quote {
  conid: number;
  symbol: string;
  lastPrice?: number;
  bidPrice?: number;
  askPrice?: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  timestamp: Date;
}

export interface MarketDataRepository {
  getQuoteBySymbol(symbol: string, secType?: string): Promise<Quote | null>;
}

