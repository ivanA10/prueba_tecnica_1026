export interface ChunkOptions {
  maxTokens: number;
  overlapTokens: number;
  countTokens: (text: string) => number;
}

/** Splits text into overlapping chunks of at most `maxTokens` tokens. Pure; never returns empty chunks. */
export function chunkText(text: string, opts: ChunkOptions): string[] {
  const { maxTokens, overlapTokens, countTokens } = opts;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // Sentence units; oversized sentences are split by words.
  const units: string[] = [];
  for (const sentence of normalized.match(/[^.!?]+[.!?]*\s*/g) ?? [normalized]) {
    const s = sentence.trim();
    if (!s) continue;
    if (countTokens(s) <= maxTokens) {
      units.push(s);
      continue;
    }
    let current: string[] = [];
    for (const word of s.split(' ')) {
      if (current.length && countTokens([...current, word].join(' ')) > maxTokens) {
        units.push(current.join(' '));
        current = [];
      }
      current.push(word);
    }
    if (current.length) units.push(current.join(' '));
  }

  const chunks: string[] = [];
  let window: { text: string; tokens: number }[] = [];
  let total = 0;
  const flush = () => {
    if (window.length) chunks.push(window.map((u) => u.text).join(' '));
  };
  for (const unit of units) {
    const tokens = countTokens(unit);
    if (window.length && total + tokens > maxTokens) {
      flush();
      // keep trailing units as overlap
      const kept: typeof window = [];
      let keptTokens = 0;
      for (let i = window.length - 1; i >= 0; i--) {
        if (keptTokens + window[i].tokens > overlapTokens) break;
        kept.unshift(window[i]);
        keptTokens += window[i].tokens;
      }
      // overlap must leave room for the new unit
      while (kept.length && keptTokens + tokens > maxTokens) keptTokens -= kept.shift()!.tokens;
      window = kept;
      total = keptTokens;
    }
    window.push({ text: unit, tokens });
    total += tokens;
  }
  flush();
  return chunks;
}
