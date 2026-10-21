# Contexto de build: raiz del monorepo (docker build -f apps/web/Dockerfile .)
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter web... \
 && pnpm --filter web build

FROM nginx:1.27-alpine
# nginx:*-alpine trae wget (healthcheck) y envsubst sobre /etc/nginx/templates/*.template
ENV AUTH_UPSTREAM=auth-service:3001 \
    USER_UPSTREAM=user-service:3002 \
    ROLE_UPSTREAM=role-service:3003 \
    AUDIT_UPSTREAM=audit-service:3004 \
    AGENT_UPSTREAM=ai-agent-service:3005 \
    NGINX_ENVSUBST_FILTER=_UPSTREAM
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY apps/web/nginx/proxy_params.inc /etc/nginx/conf.d/proxy_params.inc
EXPOSE 8080
