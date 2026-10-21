#!/usr/bin/env bash
# Idempotent: creates .env, infra/env/*.env and secrets/jwt_private.pem if missing.
# Never prints secret values.
set -euo pipefail
cd "$(dirname "$0")/.."

rand() { openssl rand -hex 16; }

# Replace every change-me / <change-me> value with a fresh random, line by line.
fill_random() {
  local file="$1" tmp line
  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      *'<change-me>'*) line="${line//<change-me>/$(rand)}" ;;
      *change-me*) line="${line//change-me/$(rand)}" ;;
    esac
    printf '%s\n' "$line" >> "$tmp"
  done < "$file"
  mv "$tmp" "$file"
}

# Replace <VAR> markers with the value of VAR from the infra .env.
fill_markers() {
  local file="$1" tmp line key val
  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    while IFS='=' read -r key val; do
      case "$key" in ''|\#*) continue ;; esac
      val="${val%$'\r'}"
      line="${line//<$key>/$val}"
    done < .env
    printf '%s\n' "$line" >> "$tmp"
  done < "$file"
  mv "$tmp" "$file"
}

if [ ! -f .env ]; then
  cp .env.example .env
  fill_random .env
  echo "created .env"
fi

for tpl in infra/env/*.env.example; do
  [ -e "$tpl" ] || continue
  target="${tpl%.example}"
  if [ ! -f "$target" ]; then
    cp "$tpl" "$target"
    fill_markers "$target"
    fill_random "$target"
    echo "created $target"
  fi
done

# ---- Cross-service consistency (idempotent; fills missing keys, never prints secrets) ----
get_kv() { # file key -> value (CR stripped), empty if absent
  local line
  line="$(grep -E "^$2=" "$1" 2>/dev/null | head -n1 || true)"
  line="${line%$'\r'}"
  printf '%s' "${line#*=}"
}
set_kv() { # file key value : replace the line or append it
  local file="$1" key="$2" val="$3" tmp line found=0
  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      "$key="*) printf '%s=%s\n' "$key" "$val" >> "$tmp"; found=1 ;;
      *) printf '%s\n' "$line" >> "$tmp" ;;
    esac
  done < "$file"
  [ "$found" = 1 ] || printf '%s=%s\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$file"
}
needs_value() { case "$1" in ''|\<*|*change-me*) return 0 ;; *) return 1 ;; esac; }
ensure_kv() { # file key default : set only when missing/empty/placeholder
  if needs_value "$(get_kv "$1" "$2")"; then set_kv "$1" "$2" "$3"; fi
}

E=infra/env
if [ -f $E/user-service.env ] && [ -f $E/auth-service.env ] && [ -f $E/role-service.env ]; then
  # user-service client id/secret must appear in auth-service SERVICE_CLIENTS
  ensure_kv $E/user-service.env SVC_CLIENT_ID user-service
  ensure_kv $E/user-service.env SVC_CLIENT_SECRET "$(rand)"
  set_kv $E/auth-service.env SERVICE_CLIENTS "$(get_kv $E/user-service.env SVC_CLIENT_ID):$(get_kv $E/user-service.env SVC_CLIENT_SECRET)"
  ensure_kv $E/auth-service.env SVC_CLIENT_ID auth-service
  ensure_kv $E/auth-service.env SVC_CLIENT_SECRET "$(rand)"
  ensure_kv $E/auth-service.env JWT_PRIVATE_KEY_PATH /run/secrets/jwt_private.pem

  # admin role id shared by role-service (seed) and user-service (admin seed)
  ensure_kv $E/role-service.env ADMIN_ROLE_ID 00000000-0000-4000-8000-000000000001
  set_kv $E/user-service.env ADMIN_SEED_ROLE_ID "$(get_kv $E/role-service.env ADMIN_ROLE_ID)"

  # admin seed credentials
  ensure_kv $E/user-service.env ADMIN_SEED_EMAIL admin@toka.local
  if needs_value "$(get_kv $E/user-service.env ADMIN_SEED_PASSWORD)"; then
    set_kv $E/user-service.env ADMIN_SEED_PASSWORD "$(rand)"
    echo "generated admin password"
  fi

  # service URLs / JWKS (compose network DNS names)
  ensure_kv $E/user-service.env JWKS_URI http://auth-service:3001/.well-known/jwks.json
  ensure_kv $E/user-service.env AUTH_BASE_URL http://auth-service:3001
  ensure_kv $E/user-service.env ROLE_BASE_URL http://role-service:3003
  ensure_kv $E/role-service.env AUTH_JWKS_URL http://auth-service:3001/.well-known/jwks.json
  ensure_kv $E/audit-service.env JWKS_URI http://auth-service:3001/.well-known/jwks.json
  ensure_kv $E/ai-agent-service.env JWKS_URI http://auth-service:3001/.well-known/jwks.json
  ensure_kv $E/ai-agent-service.env USER_SERVICE_URL http://user-service:3002
  ensure_kv $E/ai-agent-service.env QDRANT_URL http://qdrant:6333
  echo "admin login: $(get_kv $E/user-service.env ADMIN_SEED_EMAIL)  (password: ADMIN_SEED_PASSWORD in $E/user-service.env)"
fi

if [ ! -s secrets/jwt_private.pem ]; then
  mkdir -p secrets
  openssl genrsa -out secrets/jwt_private.pem 2048 >/dev/null 2>&1
  chmod 600 secrets/jwt_private.pem 2>/dev/null || true
  echo "created secrets/jwt_private.pem"
fi
# The container runs as non-root 'node'; the bind-mounted key must be world-readable (dev only).
chmod 644 secrets/jwt_private.pem 2>/dev/null || true
