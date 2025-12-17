import type { Account, AccountRepository, Balance, Position } from '../domain/account';
import type { GatewayClient } from './gateway-client';

/**
 * IBKR summary field format - each metric is wrapped in this structure
 */
interface IbkrSummaryField {
  amount: number;
  currency: string | null;
  isNull: boolean;
  timestamp: number;
  value: string;
  severity: number;
}

/**
 * IBKR portfolio summary response structure
 * Contains various financial metrics, each as an IbkrSummaryField
 */
interface IbkrSummaryResponse {
  accountcode?: IbkrSummaryField;
  accounttype?: IbkrSummaryField;
  availablefunds?: IbkrSummaryField;
  buyingpower?: IbkrSummaryField;
  netliquidation?: IbkrSummaryField;
  totalcashvalue?: IbkrSummaryField;
  settledcash?: IbkrSummaryField;
  accruedinterest?: IbkrSummaryField;
  [key: string]: IbkrSummaryField | undefined;
}

export class IbkrAccountRepository implements AccountRepository {
  constructor(private readonly client: GatewayClient) {}

  async getAccounts(): Promise<string[]> {
    const response = await this.client.get<{ accounts: string[] }>('/v1/api/iserver/accounts');
    return response.accounts;
  }

  async getAccount(accountId: string): Promise<Account | null> {
    try {
      const [summary, positions] = await Promise.all([
        this.client.get<IbkrSummaryResponse>(`/v1/api/portfolio/${accountId}/summary`),
        this.getPositions(accountId),
      ]);

      const baseCurrency = this.extractCurrency(summary);
      const balances = this.mapBalances(summary, baseCurrency);
      const accountType = summary.accounttype?.value ?? 'unknown';

      return {
        accountId,
        accountType,
        baseCurrency,
        balances,
        positions,
      };
    } catch {
      return null;
    }
  }

  async getPositions(accountId: string): Promise<Position[]> {
    const response = await this.client.get<IbkrPositionResponse[]>(
      `/v1/api/portfolio/${accountId}/positions/0`
    );

    if (!Array.isArray(response)) {
      return [];
    }

    return response.map((pos) => ({
      conid: pos.conid,
      symbol: pos.contractDesc ?? pos.ticker ?? 'UNKNOWN',
      type: pos.assetClass ?? 'UNKNOWN',
      quantity: pos.position ?? 0,
      avgCost: pos.avgCost ?? 0,
      marketValue: pos.mktValue ?? 0,
      unrealizedPnl: pos.unrealizedPnl ?? 0,
    }));
  }

  private extractCurrency(summary: IbkrSummaryResponse): string {
    // Try to get currency from netliquidation or totalcashvalue fields
    return (
      summary.netliquidation?.currency ??
      summary.totalcashvalue?.currency ??
      summary.availablefunds?.currency ??
      'USD'
    );
  }

  private mapBalances(summary: IbkrSummaryResponse, currency: string): Balance[] {
    const cash = summary.totalcashvalue?.amount ?? summary.settledcash?.amount ?? 0;
    const totalValue = summary.netliquidation?.amount ?? 0;
    const buyingPower = summary.buyingpower?.amount ?? summary.availablefunds?.amount ?? 0;

    return [
      {
        currency,
        cash,
        totalValue,
        buyingPower,
      },
    ];
  }
}

/**
 * IBKR position response structure
 */
interface IbkrPositionResponse {
  conid: number;
  contractDesc?: string;
  ticker?: string;
  assetClass?: string;
  position?: number;
  avgCost?: number;
  mktValue?: number;
  unrealizedPnl?: number;
}



