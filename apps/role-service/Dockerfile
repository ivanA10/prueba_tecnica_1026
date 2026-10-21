# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f apps/role-service/Dockerfile .)
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates   && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/role-service ./apps/role-service
RUN pnpm install --frozen-lockfile --filter "@toka/role-service..."
# Builds the shared @toka/* packages first, then prisma generate + tsc for the service.
RUN pnpm --filter "@toka/role-service..." build

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates   && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
WORKDIR /repo/apps/role-service
EXPOSE 3003
# Migrations are applied on start (idempotent); then the service boots.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
