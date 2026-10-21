// Downloads the MiniLM ONNX model into EMBEDDING_MODEL_DIR (default ./models). Run at image build time.
import { env, pipeline } from '@huggingface/transformers';

const dir = process.env.EMBEDDING_MODEL_DIR || 'models';
env.cacheDir = dir;
env.allowRemoteModels = true;
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const out = await extractor(['dimension check'], { pooling: 'mean', normalize: true });
if (out.dims[1] !== 384) throw new Error(`Unexpected embedding dimension ${out.dims[1]}`);
console.log(`model ready in ${dir}`);
