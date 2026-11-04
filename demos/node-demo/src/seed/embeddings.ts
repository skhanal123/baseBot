import OpenAI from 'openai';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export interface EmbeddingClient {
  embedTexts(texts: string[]): Promise<number[][]>;
}

export function createOpenAiEmbeddingClient(
  apiKey: string,
  model = DEFAULT_EMBEDDING_MODEL,
): EmbeddingClient {
  const openai = new OpenAI({ apiKey });
  return {
    async embedTexts(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }
      const response = await openai.embeddings.create({ model, input: texts });
      return response.data.sort((a, b) => a.index - b.index).map((row) => row.embedding);
    },
  };
}

export async function embedInBatches(
  client: EmbeddingClient,
  texts: string[],
  batchSize = 32,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vectors = await client.embedTexts(batch);
    out.push(...vectors);
  }
  return out;
}
