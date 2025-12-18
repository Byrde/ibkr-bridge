import type { FastifyInstance } from 'fastify';
import type { AccountRepository } from '../../domain/account';
import type { OrderRepository, CreateOrderRequest, ModifyOrderRequest } from '../../domain/order';
import {
  OrderSchema,
  OrdersResponseSchema,
  CreateOrderRequestSchema,
  ModifyOrderRequestSchema,
  ErrorSchema,
} from '../schemas';

export interface OrderRouteDeps {
  orderRepository: OrderRepository;
  accountRepository: AccountRepository;
}

export async function orderRoutes(fastify: FastifyInstance, deps: OrderRouteDeps): Promise<void> {
  fastify.get('/orders', {
    schema: {
      description: 'Get all orders for the account',
      tags: ['Orders'],
      security: [{ basicAuth: [] }],
      response: {
        200: OrdersResponseSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const orders = await deps.orderRepository.getOrders(accounts[0]);
    return { orders };
  });

  fastify.post<{ Body: CreateOrderRequest }>('/orders', {
    schema: {
      description: 'Place a new order',
      tags: ['Orders'],
      security: [{ basicAuth: [] }],
      body: CreateOrderRequestSchema,
      response: {
        201: OrderSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    const order = await deps.orderRepository.placeOrder(accounts[0], request.body);
    return reply.status(201).send(order);
  });

  fastify.put<{ Params: { orderId: string }; Body: ModifyOrderRequest }>(
    '/orders/:orderId',
    {
      schema: {
        description: 'Modify an existing order',
        tags: ['Orders'],
        security: [{ basicAuth: [] }],
        params: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID to modify' },
          },
          required: ['orderId'],
        },
        body: ModifyOrderRequestSchema,
        response: {
          200: OrderSchema,
          404: ErrorSchema,
        },
      },
    },
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

  fastify.delete<{ Params: { orderId: string } }>('/orders/:orderId', {
    schema: {
      description: 'Cancel an order',
      tags: ['Orders'],
      security: [{ basicAuth: [] }],
      params: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order ID to cancel' },
        },
        required: ['orderId'],
      },
      response: {
        204: { type: 'null', description: 'Order cancelled successfully' },
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const accounts = await deps.accountRepository.getAccounts();
    if (accounts.length === 0) {
      return reply.status(404).send({ error: 'No accounts found' });
    }

    await deps.orderRepository.cancelOrder(accounts[0], request.params.orderId);
    return reply.status(204).send();
  });
}





