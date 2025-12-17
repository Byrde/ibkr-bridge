import type { FastifyInstance } from 'fastify';
import type { AccountRepository } from '../../domain/account';
import type { OrderRepository, CreateOrderRequest, ModifyOrderRequest } from '../../domain/order';

export interface OrderRouteDeps {
  orderRepository: OrderRepository;
  accountRepository: AccountRepository;
}

export async function orderRoutes(fastify: FastifyInstance, deps: OrderRouteDeps): Promise<void> {
  fastify.get('/orders', async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const orders = await deps.orderRepository.getOrders(accounts[0]);
    return { orders };
  });

  fastify.post<{ Body: CreateOrderRequest }>('/orders', async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const order = await deps.orderRepository.placeOrder(accounts[0], request.body);
    return reply.status(201).send(order);
  });

  fastify.put<{ Params: { orderId: string }; Body: ModifyOrderRequest }>(
    '/orders/:orderId',
    async (request, reply) => {
      const accounts = await deps.accountRepository.getAccounts();
      if (accounts.length === 0) {
        return reply.status(404).send({ error: 'No accounts found' });
      }

      const order = await deps.orderRepository.modifyOrder(
        accounts[0],
        request.params.orderId,
        request.body
      );
      return order;
    }
  );

  fastify.delete<{ Params: { orderId: string } }>('/orders/:orderId', async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    await deps.orderRepository.cancelOrder(accounts[0], request.params.orderId);
    return reply.status(204).send();
  });
}




