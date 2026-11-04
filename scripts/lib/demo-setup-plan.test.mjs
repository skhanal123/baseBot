import assert from 'node:assert/strict';
import test from 'node:test';

import { planDemoSetup } from './demo-setup-plan.mjs';

test('postgres path runs compose default profile and postgres migrations', () => {
  const plan = planDemoSetup({ DURABLE_STORE: 'postgres' });
  assert.equal(plan.store, 'postgres');
  assert.deepEqual(plan.composeArgs, ['compose', 'up', '-d']);
  assert.deepEqual(plan.steps, ['migrate', 'migrate:demo', 'seed:demo']);
});

test('mongo path enables mongo compose profile and seeds only', () => {
  const plan = planDemoSetup({ DURABLE_STORE: 'mongo' });
  assert.equal(plan.store, 'mongo');
  assert.deepEqual(plan.composeArgs, ['compose', '--profile', 'mongo', 'up', '-d']);
  assert.deepEqual(plan.steps, ['seed:demo']);
});

test('defaults to postgres when DURABLE_STORE unset', () => {
  const plan = planDemoSetup({});
  assert.equal(plan.store, 'postgres');
});

test('rejects unknown DURABLE_STORE', () => {
  assert.throws(() => planDemoSetup({ DURABLE_STORE: 'sqlite' }), /DURABLE_STORE/);
});
