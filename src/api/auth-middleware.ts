import type { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthConfig {
  username: string;
  password: string;
}

export function createAuthMiddleware(config: AuthConfig) {
  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      reply.status(401).header('WWW-Authenticate', 'Basic realm="IBKR REST Bridge"').send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username !== config.username || password !== config.password) {
      reply.status(401).header('WWW-Authenticate', 'Basic realm="IBKR REST Bridge"').send({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
      return;
    }
  };
}



