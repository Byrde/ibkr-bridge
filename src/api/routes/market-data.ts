import type { FastifyInstance } from 'fastify';
import type { MarketDataRepository } from '../../domain/market-data';
import { QuoteSchema, ErrorSchema } from '../schemas';

export interface MarketDataRouteDeps {
  marketDataRepository: MarketDataRepository;
}

export async function marketDataRoutes(
  fastify: FastifyInstance,
  deps: MarketDataRouteDeps
): Promise<void> {
  fastify.get<{ Params: { symbol: string } }>('/quote/:symbol', {
    schema: {
      description: 'Get quote for a symbol',
      tags: ['Market Data'],
      security: [{ basicAuth: [] }],
      params: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker symbol', example: 'AAPL' },
        },
        required: ['symbol'],
      },
      response: {
        200: QuoteSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const quote = await deps.marketDataRepository.getQuoteBySymbol(request.params.symbol);
    if (!quote) {
      return reply.status(404).send({ error: 'Symbol not found' });
    }

    return quote;
  });
}





