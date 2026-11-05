import type { BaseBotServer } from '@basebot/node';
import { USER_ID_MAX_LENGTH } from '@basebot/core';

import { resolveDemoContext } from '../demo/resolve-demo-context.js';
import type { TelecomToolBackend } from '../tools/telecom-backend.js';

/** Demo-only route — not part of the public OpenAPI v1 contract. */
export function registerDemoContextRoutes(
  server: BaseBotServer,
  backend: TelecomToolBackend,
): void {
  server.get('/demo/context', async (request, reply) => {
    const query = request.query as { user_id?: string };
    const user_id = query.user_id?.trim();
    if (!user_id) {
      return reply.status(400).send({
        code: 'BAD_REQUEST',
        message: 'Query parameter user_id is required',
      });
    }
    if (user_id.length > USER_ID_MAX_LENGTH) {
      return reply.status(400).send({
        code: 'BAD_REQUEST',
        message: `user_id must be at most ${String(USER_ID_MAX_LENGTH)} characters`,
      });
    }

    const context = await resolveDemoContext(backend, user_id);
    return reply.send(context);
  });
}
