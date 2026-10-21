/**
 * Local ONNX embeddings (all-MiniLM-L6-v2, 384-d output) through @huggingface/transformers.
 * Lazy-loaded; remote downloads are disabled at runtime (the model is fetched at image build time
 * by scripts/fetch-model.mjs). Mean pooling + L2 normalisation.
 */
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from '../../application/ports/embedding-provider.port';

export const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

interface Extractor {
  (texts: string[], opts: { pooling: string; normalize: boolean }): Promise<{ tolist(): number[][] }>;
  tokenizer: { encode(text: string): number[] };
}

export class OnnxEmbeddingProvider implements EmbeddingProvider {
  private extractor?: Extractor;
  private loading?: Promise<void>;

  constructor(private readonly modelDir: string) {}

  init(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const tf = await dynamicImport('@huggingface/transformers');
    tf.env.allowRemoteModels = false;
    tf.env.localModelPath = this.modelDir;
    this.extractor = (await tf.pipeline('feature-extraction', MODEL_NAME)) as Extractor;
  }

  countTokens(text: string): number {
    if (this.extractor) return this.extractor.tokenizer.encode(text).length;
    return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.5);
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.init();
    const out = (await this.extractor!(texts, { pooling: 'mean', normalize: true })).tolist();
    if (out[0] && out[0].length !== EMBEDDING_DIMENSIONS) throw new Error('Unexpected embedding dimension');
    return out;
  }
}
