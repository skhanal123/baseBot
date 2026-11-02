/**
 * k6 load profile for baseBot MVP (TDD § Performance Requirements).
 * Requires mock LLM backend running at BASE_URL.
 *
 * Usage: k6 run -e BASE_URL=http://localhost:3000 tests/load/k6-stream.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '10m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

const baseUrl = __ENV.BASE_URL ?? 'http://localhost:3000';

export default function () {
  const userId = `usr_k6_${__VU}`;
  const createRes = http.post(
    `${baseUrl}/v1/threads`,
    JSON.stringify({ user_id: userId }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(createRes, { 'thread created': (r) => r.status === 201 || r.status === 409 });

  let threadId;
  if (createRes.status === 201) {
    threadId = createRes.json('thread_id');
  } else {
    const listRes = http.get(`${baseUrl}/v1/threads?user_id=${userId}`);
    threadId = listRes.json('threads.0.id');
  }

  const sendRes = http.post(
    `${baseUrl}/v1/threads/${threadId}/messages`,
    JSON.stringify({ user_id: userId, content: 'load test ping' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(sendRes, { 'message accepted': (r) => r.status === 202 });

  const jobId = sendRes.json('job_id');
  const token = sendRes.json('stream_token');
  const streamRes = http.get(`${baseUrl}/v1/stream/${jobId}?token=${token}`);
  check(streamRes, {
    'stream ok': (r) => r.status === 200,
    'has message.end': (r) => r.body.includes('message.end'),
  });

  sleep(1);
}
