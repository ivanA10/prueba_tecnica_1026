# Build context: repository root.  docker build -f apps/audit-service/Dockerfile .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/audit-service ./apps/audit-service
RUN pnpm install --frozen-lockfile --filter "@toka/audit-service..."
RUN pnpm --filter "@toka/audit-service^..." build && pnpm --filter @toka/audit-service build

FROM node:22-slim
ENV NODE_ENV=production PORT=3004
WORKDIR /repo/apps/audit-service
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 3004
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3004/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
