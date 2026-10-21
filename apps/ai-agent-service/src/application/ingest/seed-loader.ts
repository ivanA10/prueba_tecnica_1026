import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IngestDocumentUseCase, IngestInput } from './ingest-document.use-case';

export function parseKnowledgeFile(raw: string, fallbackId: string): IngestInput {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const roleScope = (meta.roleScope ?? 'all')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    docId: meta.docId || fallbackId,
    source: meta.source || fallbackId,
    roleScope: roleScope.length ? roleScope : ['all'],
    text: (m ? m[2] : raw).trim(),
  };
}

/** Ingests knowledge/*.md; idempotent because ingestion replaces by docId. */
export async function seedKnowledge(dir: string, ingest: IngestDocumentUseCase): Promise<number> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  for (const f of files) {
    await ingest.ingest(parseKnowledgeFile(await readFile(join(dir, f), 'utf8'), f.replace(/\.md$/, '')));
  }
  return files.length;
}
