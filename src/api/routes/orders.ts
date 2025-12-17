import type { FastifyInstance } from 'fastify';
import type { AccountRepository } from '../../domain/account';
import type { OrderRepository, CreateOrderRequest, ModifyOrderRequest } from '../../domain/order';

export interface OrderRouteDeps {
  orderRepository: OrderRepository;
  accountRepository: AccountRepository;
}

const orderSchema = {
  type: 'object',
  properties: {
    orderId: { type: 'string' },
    accountId: { type: 'string' },
    instrument: {
      type: 'object',
      properties: {
        conid: { type: 'number' },
        symbol: { type: 'string' },
        type: { type: 'string', enum: ['stock', 'option', 'future', 'forex', 'other'] },
        exchange: { type: ['string', 'null'] },
        currency: { type: ['string', 'null'] },
      },
    },
    side: { type: 'string', enum: ['buy', 'sell'] },
    type: { type: 'string', enum: ['market', 'limit'] },
    quantity: { type: 'number' },
    limitPrice: { type: ['number', 'null'] },
    status: { type: 'string', enum: ['pending', 'submitted', 'filled', 'partially_filled', 'cancelled', 'rejected'] },
    filledQuantity: { type: 'number' },
    avgFillPrice: { type: ['number', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

export async function orderRoutes(fastify: FastifyInstance, deps: OrderRouteDeps): Promise<void> {
  fastify.get('/orders', {
    schema: {
      tags: ['Orders'],
      summary: 'Get orders',
      description: 'Retrieve all orders for the primary account',
      response: {
        200: {
          type: 'object',
          properties: {
            orders: {
              type: 'array',
              items: orderSchema,
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

    const orders = await deps.orderRepository.getOrders(accounts[0]);
    return { orders };
  });

  fastify.post<{ Body: CreateOrderRequest }>('/orders', {
    schema: {
      tags: ['Orders'],
      summary: 'Create order',
      description: 'Place a new order for the primary account',
      body: {
        type: 'object',
        required: ['conid', 'side', 'type', 'quantity'],
        properties: {
          conid: { type: 'number', description: 'Contract ID' },
          side: { type: 'string', enum: ['buy', 'sell'], description: 'Order side' },
          type: { type: 'string', enum: ['market', 'limit'], description: 'Order type' },
          quantity: { type: 'number', description: 'Order quantity' },
          limitPrice: { type: 'number', description: 'Limit price (required for limit orders)' },
        },
      },
      response: {
        201: orderSchema,
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

    const order = await deps.orderRepository.placeOrder(accounts[0], request.body);
    return reply.status(201).send(order);
  });

  fastify.put<{ Params: { orderId: string }; Body: ModifyOrderRequest }>(
    '/orders/:orderId',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Modify order',
        description: 'Modify an existing order',
        params: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID' },
          },
        },
        body: {
          type: 'object',
          properties: {
            quantity: { type: 'number', description: 'New order quantity' },
            limitPrice: { type: 'number', description: 'New limit price' },
          },
        },
        response: {
          200: orderSchema,
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
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
      tags: ['Orders'],
      summary: 'Cancel order',
      description: 'Cancel an existing order',
      params: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order ID' },
        },
      },
      response: {
        204: {
          type: 'null',
          description: 'Order cancelled successfully',
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

    await deps.orderRepository.cancelOrder(accounts[0], request.params.orderId);
    return reply.status(204).send();
  });
}




