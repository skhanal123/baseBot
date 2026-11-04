/**
 * Synthetic turn probe for staging soak TTFT sampling (excludes customer tool latency when using mock LLM).
 * @param {string} baseUrl
 * @param {string} [userId]
 */
export async function probeTimeToFirstToken(baseUrl, userId = `usr_soak_${Date.now()}`) {
  const started = performance.now();

  const createRes = await fetch(`${baseUrl}/v1/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });

  let threadId;
  if (createRes.status === 201) {
    const body = await createRes.json();
    threadId = body.thread_id;
  } else if (createRes.status === 409) {
    const listRes = await fetch(
      `${baseUrl}/v1/threads?user_id=${encodeURIComponent(userId)}`,
    );
    if (!listRes.ok) {
      throw new Error(`list threads failed: ${listRes.status}`);
    }
    const listBody = await listRes.json();
    threadId = listBody.threads?.[0]?.id;
  } else {
    throw new Error(`create thread failed: ${createRes.status}`);
  }

  if (!threadId) {
    throw new Error('no thread_id for TTFT probe');
  }

  const sendRes = await fetch(`${baseUrl}/v1/threads/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, content: 'soak ttft probe' }),
  });

  if (sendRes.status !== 202) {
    throw new Error(`send message failed: ${sendRes.status}`);
  }

  const sendBody = await sendRes.json();
  const streamUrl = `${baseUrl}/v1/stream/${sendBody.job_id}?token=${encodeURIComponent(sendBody.stream_token)}`;
  const streamRes = await fetch(streamUrl);
  if (!streamRes.ok) {
    throw new Error(`stream failed: ${streamRes.status}`);
  }

  const text = await streamRes.text();
  const deltaIndex = text.indexOf('event: message.delta');
  if (deltaIndex === -1) {
    throw new Error('stream missing message.delta');
  }

  return performance.now() - started;
}
