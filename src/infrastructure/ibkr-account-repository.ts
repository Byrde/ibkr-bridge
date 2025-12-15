import type { Account, AccountRepository, Position } from '../domain/account';
import type { GatewayClient } from './gateway-client';

export class IbkrAccountRepository implements AccountRepository {
  constructor(private readonly client: GatewayClient) {}

  async getAccounts(): Promise<string[]> {
    const response = await this.client.get<{ accounts: string[] }>('/v1/api/iserver/accounts');
    return response.accounts;
  }

  async getAccount(accountId: string): Promise<Account | null> {
    try {
      // Fetch summary and positions in parallel
      // Summary will be used when we implement full account mapping
      await this.client.get<Record<string, unknown>>(`/v1/api/portfolio/${accountId}/summary`);
      const positions = await this.getPositions(accountId);

      // TODO: Map IBKR response to domain model
      return {
        accountId,
        accountType: 'individual',
        baseCurrency: 'USD',
        balances: [],
        positions,
      };
    } catch {
      return null;
    }
  }

  async getPositions(accountId: string): Promise<Position[]> {
    await this.client.get<unknown[]>(`/v1/api/portfolio/${accountId}/positions/0`);

    // TODO: Map IBKR response to domain model
    return [];
  }
}
