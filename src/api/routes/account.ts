import type { FastifyInstance } from 'fastify';
import type { AccountRepository } from '../../domain/account';

export interface AccountRouteDeps {
  accountRepository: AccountRepository;
}

export async function accountRoutes(
  fastify: FastifyInstance,
  deps: AccountRouteDeps
): Promise<void> {
  fastify.get('/account', async (request, reply) => {
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

  fastify.get('/account/positions', async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const positions = await deps.accountRepository.getPositions(accounts[0]);
    return { positions };
  });
}
