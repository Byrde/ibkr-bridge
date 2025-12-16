import type { FastifyInstance } from 'fastify';
import type { MarketDataRepository } from '../../domain/market-data';

export interface MarketDataRouteDeps {
  marketDataRepository: MarketDataRepository;
}

export async function marketDataRoutes(
  fastify: FastifyInstance,
  deps: MarketDataRouteDeps
): Promise<void> {
  fastify.get<{ Querystring: { q: string } }>('/instruments', async (request, reply) => {
    const query = request.query.q;
    if (!query) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const instruments = await deps.marketDataRepository.searchInstruments(query);
    return { instruments };
  });

  fastify.get<{ Params: { conid: string } }>('/quotes/:conid', async (request, reply) => {
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



