# Evaluacion del agente — notas de lectura

El informe generado esta en [report.md](report.md) (`pnpm --filter @toka/ai-agent-service eval` lo regenera completo).

- Este informe evalua el pipeline del agente (prompt, validacion de salida, filtro `roleScope`, herramienta) con proveedor `mock`, embeddings hash y almacen en memoria; no pasa por Qdrant ni por los embeddings ONNX del servicio desplegado. La recuperacion real (Qdrant `client.query`) y la ingesta (`POST /api/agent/ingest`, modo "Cargar conocimiento" de la web) se ejercitan en `e2e/agent.spec.ts`.
- La exposicion de la herramienta `lookup_users` depende de permisos: solo se ofrece al LLM si el llamante tiene `users:read`. El caso `t1` se ejecuta con `permissions: ['*']`; el resto de casos no la reciben.
- Las cifras de latencia y tokens no son representativas de un modelo real; para medirlas, ejecutar con `EVAL_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` y `LLM_MODEL`.
