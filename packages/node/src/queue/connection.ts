import type { ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';

/** BullMQ connection from an existing ioredis client (avoids duplicate client version types). */
export function bullmqConnection(redis: Redis): ConnectionOptions {
  const options = redis.options;
  const connection: ConnectionOptions = {
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 6379,
    maxRetriesPerRequest: null,
  };

  if (options.password) {
    connection.password = options.password;
  }
  if (options.db !== undefined) {
    connection.db = options.db;
  }
  if (options.username) {
    connection.username = options.username;
  }
  if (options.tls) {
    connection.tls = options.tls;
  }

  return connection;
}
