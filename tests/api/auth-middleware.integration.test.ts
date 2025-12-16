import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { createAuthMiddleware } from '../../src/api/auth-middleware';

describe('Auth Middleware Integration', () => {
  const TEST_USERNAME = 'testuser';
  const TEST_PASSWORD = 'testpass';

  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify();

    // Register auth middleware
    const authMiddleware = createAuthMiddleware({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });

    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip auth for health endpoint (matches production behavior)
      if (request.url === '/health') {
        return;
      }
      await authMiddleware(request, reply);
    });

    // Test routes
    fastify.get('/health', async () => ({ status: 'ok' }));
    fastify.get('/protected', async () => ({ data: 'secret' }));
    fastify.post('/protected', async (request: FastifyRequest) => ({ received: request.body }));

    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Acceptance Criteria: Requests without valid Basic Auth header rejected with 401', () => {
    it('rejects request with no Authorization header', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Basic realm="IBKR REST Bridge"');
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    });

    it('rejects request with Bearer token (wrong auth type)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer sometoken',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects request with malformed Basic auth', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Basic notbase64!!!',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Acceptance Criteria: Credentials validated against env vars', () => {
    it('rejects request with wrong username', async () => {
      const credentials = Buffer.from(`wronguser:${TEST_PASSWORD}`).toString('base64');
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    });

    it('rejects request with wrong password', async () => {
      const credentials = Buffer.from(`${TEST_USERNAME}:wrongpass`).toString('base64');
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects request with both wrong username and password', async () => {
      const credentials = Buffer.from('wrong:credentials').toString('base64');
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Acceptance Criteria: Authenticated requests proceed', () => {
    it('allows GET request with valid credentials', async () => {
      const credentials = Buffer.from(`${TEST_USERNAME}:${TEST_PASSWORD}`).toString('base64');
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ data: 'secret' });
    });

    it('allows POST request with valid credentials', async () => {
      const credentials = Buffer.from(`${TEST_USERNAME}:${TEST_PASSWORD}`).toString('base64');
      const response = await fastify.inject({
        method: 'POST',
        url: '/protected',
        headers: {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/json',
        },
        payload: { test: 'data' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ received: { test: 'data' } });
    });

    it('allows health endpoint without auth (excluded by design)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ status: 'ok' });
    });
  });
});

