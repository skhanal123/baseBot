import { MongoClient } from 'mongodb';

import { createMongoAdapter, type MongoAdapter } from './mongo-adapter.js';

export interface ConnectMongoOptions {
  dbName?: string;
}

export interface MongoConnection {
  client: MongoClient;
  store: MongoAdapter;
  close(): Promise<void>;
}

/** Connect a MongoClient and return a configured durable store adapter. */
export async function connectMongo(
  connectionString: string,
  options?: ConnectMongoOptions,
): Promise<MongoConnection> {
  const client = new MongoClient(connectionString);
  await client.connect();
  const store = createMongoAdapter(client, options?.dbName);
  return {
    client,
    store,
    close: () => client.close(),
  };
}
