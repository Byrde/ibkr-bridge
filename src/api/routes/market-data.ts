import type { FastifyInstance } from 'fastify';
import type { MarketDataRepository } from '../../domain/market-data';

export interface MarketDataRouteDeps {
  marketDataRepository: MarketDataRepository;
}

export async function marketDataRoutes(
  fastify: FastifyInstance,
  deps: MarketDataRouteDeps
): Promise<void> {
  fastify.get<{ Querystring: { q: string } }>('/instruments', {
    schema: {
      tags: ['Market Data'],
      summary: 'Search instruments',
      description: 'Search for tradable instruments by symbol or name',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            instruments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  conid: { type: 'number' },
                  symbol: { type: 'string' },
                  description: { type: 'string' },
                  type: { type: 'string' },
                  exchange: { type: 'string' },
                },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query.q;
    if (!query) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const instruments = await deps.marketDataRepository.searchInstruments(query);
    return { instruments };
  });

  fastify.get<{ Params: { conid: string } }>('/quotes/:conid', {
    schema: {
      tags: ['Market Data'],
      summary: 'Get quote',
      description: 'Retrieve market data quote for a specific contract',
      params: {
        type: 'object',
        properties: {
          conid: { type: 'string', description: 'Contract ID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            conid: { type: 'number' },
            symbol: { type: 'string' },
            lastPrice: { type: ['number', 'null'] },
            bidPrice: { type: ['number', 'null'] },
            askPrice: { type: ['number', 'null'] },
            bidSize: { type: ['number', 'null'] },
            askSize: { type: ['number', 'null'] },
            volume: { type: ['number', 'null'] },
            timestamp: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
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
    const conid = parseInt(request.params.conid, 10);
    if (isNaN(conid)) {
      return reply.status(400).send({ error: 'Invalid conid' });
    }

    const quote = await deps.marketDataRepository.getQuote(conid);
    if (!quote) {
      return reply.status(404).send({ error: 'Quote not found' });
    }

    return quote;
  });
}




