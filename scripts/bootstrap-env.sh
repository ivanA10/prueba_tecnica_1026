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

if [ ! -s secrets/jwt_private.pem ]; then
  mkdir -p secrets
  openssl genrsa -out secrets/jwt_private.pem 2048 >/dev/null 2>&1
  chmod 600 secrets/jwt_private.pem 2>/dev/null || true
  echo "created secrets/jwt_private.pem"
fi
