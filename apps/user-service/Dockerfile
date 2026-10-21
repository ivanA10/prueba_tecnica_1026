# Build context: repository root.  docker build -f apps/user-service/Dockerfile .
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/user-service ./apps/user-service
RUN pnpm install --frozen-lockfile --filter "@toka/user-service..."
RUN pnpm --filter "@toka/user-service^..." build \
  && pnpm --filter @toka/user-service exec prisma generate \
  && pnpm --filter @toka/user-service build \
  # tsc does not copy the native Prisma engine; place it next to the compiled client
  && mkdir -p apps/user-service/dist/generated/prisma \
  && cp -r apps/user-service/src/generated/prisma/. apps/user-service/dist/generated/prisma/

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3002
WORKDIR /repo/apps/user-service
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
