import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe } from 'vitest';

import { registerDurableStoreAdapterTests } from '../durable/durable-store.test-suite.js';
import { createMongoAdapter } from './mongo-adapter.js';

const mongoUrl = process.env.MONGODB_URL;
const describeIntegration = mongoUrl ? describe : describe.skip;

describeIntegration('MongoAdapter', () => {
  let client: MongoClient;
  let adapter: ReturnType<typeof createMongoAdapter>;

  beforeAll(async () => {
    client = new MongoClient(mongoUrl as string);
    await client.connect();
    adapter = createMongoAdapter(client, 'basebot_test');
  });

  beforeEach(async () => {
    await client.db('basebot_test').collection('messages').deleteMany({});
    await client.db('basebot_test').collection('threads').deleteMany({});
  });

  afterAll(async () => {
    await client.close();
  });

  registerDurableStoreAdapterTests(() => ({
    adapter,
    reset: async () => {
      await client.db('basebot_test').collection('messages').deleteMany({});
      await client.db('basebot_test').collection('threads').deleteMany({});
    },
  }));
});
