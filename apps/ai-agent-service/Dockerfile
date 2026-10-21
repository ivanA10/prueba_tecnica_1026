# Build from the repository root: docker build -f apps/ai-agent-service/Dockerfile .
# Debian slim (not Alpine): onnxruntime-node needs glibc. Exact base tag: needs-verification.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/ai-agent-service ./apps/ai-agent-service
RUN pnpm install --frozen-lockfile --filter @toka/ai-agent-service...
RUN pnpm --filter "@toka/*" --filter "!@toka/ai-agent-service" -r build \
 && pnpm --filter @toka/ai-agent-service build
# Model is baked into the image: the container never downloads anything at start.
RUN cd apps/ai-agent-service && EMBEDDING_MODEL_DIR=/app/apps/ai-agent-service/models node scripts/fetch-model.mjs

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3005 \
    EMBEDDING_MODEL_DIR=/app/apps/ai-agent-service/models \
    KNOWLEDGE_DIR=/app/apps/ai-agent-service/knowledge
WORKDIR /app
COPY --from=build /app /app
RUN chown -R node:node /app
USER node
WORKDIR /app/apps/ai-agent-service
EXPOSE 3005
CMD ["node", "dist/main.js"]
