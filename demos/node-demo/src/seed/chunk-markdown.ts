export interface MarkdownChunk {
  section: string;
  chunkIndex: number;
  content: string;
}

const MAX_CHUNK_CHARS = 1800;

export function chunkMarkdown(markdown: string, sourceLabel = 'manual'): MarkdownChunk[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const sections = normalized.split(/\n(?=#+\s)/);
  const chunks: MarkdownChunk[] = [];
  let chunkIndex = 0;

  for (const sectionBlock of sections) {
    const trimmed = sectionBlock.trim();
    if (!trimmed) {
      continue;
    }
    const headingMatch = /^#{1,6}\s+(.+)$/m.exec(trimmed);
    const section = headingMatch?.[1]?.trim() ?? sourceLabel;

    if (trimmed.length <= MAX_CHUNK_CHARS) {
      chunks.push({ section, chunkIndex, content: trimmed });
      chunkIndex += 1;
      continue;
    }

    const paragraphs = trimmed.split(/\n\n+/);
    let buffer = '';
    for (const paragraph of paragraphs) {
      const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (next.length > MAX_CHUNK_CHARS && buffer) {
        chunks.push({ section, chunkIndex, content: buffer });
        chunkIndex += 1;
        buffer = paragraph;
      } else {
        buffer = next;
      }
    }
    if (buffer) {
      chunks.push({ section, chunkIndex, content: buffer });
      chunkIndex += 1;
    }
  }

  return chunks;
}
