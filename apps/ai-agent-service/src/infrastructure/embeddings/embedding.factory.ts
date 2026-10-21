import type { EmbeddingProvider } from '../../application/ports/embedding-provider.port';
import { HashEmbeddingProvider } from './hash-embedding.provider';
import { OnnxEmbeddingProvider } from './onnx-embedding.provider';

export function createEmbeddingProvider(kind: string, modelDir: string, nodeEnv = process.env.NODE_ENV): EmbeddingProvider {
  if (kind === 'hash') {
    if (nodeEnv !== 'test') throw new Error("Hash embeddings are only allowed when NODE_ENV === 'test'");
    return new HashEmbeddingProvider();
  }
  return new OnnxEmbeddingProvider(modelDir);
}
