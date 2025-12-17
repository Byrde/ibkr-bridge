export interface Balance {
  currency: string;
  cash: number;
  totalValue: number;
  buyingPower: number;
}

export interface Position {
  conid: number;
  symbol: string;
  type: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface Account {
  accountId: string;
  accountType: string;
  baseCurrency: string;
  balances: Balance[];
  positions: Position[];
}

export interface AccountRepository {
  getAccounts(): Promise<string[]>;
  getAccount(accountId: string): Promise<Account | null>;
  getPositions(accountId: string): Promise<Position[]>;
}




