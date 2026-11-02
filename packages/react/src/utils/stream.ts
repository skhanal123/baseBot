import { ErrorCode, type BaseBotErrorBody } from '@basebot/core';

export function streamField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

export function toStreamError(data: Record<string, unknown>): BaseBotErrorBody {
  const codeValue = data.code;
  const code =
    typeof codeValue === 'string' &&
    (Object.values(ErrorCode) as string[]).includes(codeValue)
      ? (codeValue as BaseBotErrorBody['code'])
      : ErrorCode.INTERNAL_ERROR;

  const body: BaseBotErrorBody = {
    code,
    message: streamField(data, 'message') || 'Stream error',
  };

  const correlationId = data.correlation_id;
  if (typeof correlationId === 'string') {
    body.correlation_id = correlationId;
  }

  return body;
}

/** Parse one SSE block (`event:` + `data:` lines). */
export function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join('\n') };
}
