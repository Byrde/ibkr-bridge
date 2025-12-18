import type { FastifyInstance } from 'fastify';
import type { MarketDataRepository } from '../../domain/market-data';
import { InstrumentsResponseSchema, QuoteSchema, ErrorSchema } from '../schemas';

export interface MarketDataRouteDeps {
  marketDataRepository: MarketDataRepository;
}

export async function marketDataRoutes(
  fastify: FastifyInstance,
  deps: MarketDataRouteDeps
): Promise<void> {
  fastify.get<{ Querystring: { q: string } }>('/instruments', {
    schema: {
      description: 'Search for instruments by symbol or name',
      tags: ['Market Data'],
      security: [{ basicAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query (symbol or name)', example: 'AAPL' },
        },
        required: ['q'],
      },
      response: {
        200: InstrumentsResponseSchema,
        400: ErrorSchema,
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
      description: 'Get quote data for an instrument',
      tags: ['Market Data'],
      security: [{ basicAuth: [] }],
      params: {
        type: 'object',
        properties: {
          conid: { type: 'string', description: 'Contract ID of the instrument', example: '265598' },
        },
        required: ['conid'],
      },
      response: {
        200: QuoteSchema,
        400: ErrorSchema,
        404: ErrorSchema,
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





