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

export interface InstrumentSearchResult {
  conid: number;
  symbol: string;
  description: string;
  type: string;
  exchange: string;
}

export interface MarketDataRepository {
  searchInstruments(query: string): Promise<InstrumentSearchResult[]>;
  getQuote(conid: number): Promise<Quote | null>;
  getQuotes(conids: number[]): Promise<Quote[]>;
}



