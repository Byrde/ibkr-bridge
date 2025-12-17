import type { FastifyInstance } from 'fastify';
import type { AccountRepository } from '../../domain/account';

export interface AccountRouteDeps {
  accountRepository: AccountRepository;
}

export async function accountRoutes(
  fastify: FastifyInstance,
  deps: AccountRouteDeps
): Promise<void> {
  fastify.get('/account', {
    schema: {
      tags: ['Account'],
      summary: 'Get account details',
      description: 'Retrieve details for the primary account including balances and positions',
      response: {
        200: {
          type: 'object',
          properties: {
            accountId: { type: 'string' },
            accountType: { type: 'string' },
            baseCurrency: { type: 'string' },
            balances: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  currency: { type: 'string' },
                  cash: { type: 'number' },
                  totalValue: { type: 'number' },
                  buyingPower: { type: 'number' },
                },
              },
            },
            positions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  conid: { type: 'number' },
                  symbol: { type: 'string' },
                  type: { type: 'string' },
                  quantity: { type: 'number' },
                  avgCost: { type: 'number' },
                  marketValue: { type: 'number' },
                  unrealizedPnl: { type: 'number' },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const account = await deps.accountRepository.getAccount(accounts[0]);
    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    return account;
  });

  fastify.get('/account/positions', {
    schema: {
      tags: ['Account'],
      summary: 'Get account positions',
      description: 'Retrieve all positions for the primary account',
      response: {
        200: {
          type: 'object',
          properties: {
            positions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  conid: { type: 'number' },
                  symbol: { type: 'string' },
                  type: { type: 'string' },
                  quantity: { type: 'number' },
                  avgCost: { type: 'number' },
                  marketValue: { type: 'number' },
                  unrealizedPnl: { type: 'number' },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const positions = await deps.accountRepository.getPositions(accounts[0]);
    return { positions };
  });
}




