export const EMBEDDING_DIMENSIONS = 1536;

export function toPgVector(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected embedding length ${String(EMBEDDING_DIMENSIONS)}, got ${String(values.length)}`,
    );
  }
  return `[${values.join(',')}]`;
}
