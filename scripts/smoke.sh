#!/usr/bin/env bash
# Smoke end-to-end contra el stack levantado (docker compose up -d --build --wait).
# Flujo: login admin -> crear usuario -> listar -> auditoria user.created -> agente (mock).
# Sale con codigo != 0 ante cualquier fallo. Nunca imprime contrasenas ni tokens.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${BASE_URL:-http://localhost:8080}"
ENVF=infra/env/user-service.env
[ -f "$ENVF" ] || { echo "FAIL: falta $ENVF (ejecuta scripts/bootstrap-env.sh)"; exit 1; }

kv() { grep -E "^$1=" "$ENVF" | head -n1 | cut -d= -f2- | tr -d '\r'; }
ADMIN_EMAIL="$(kv ADMIN_SEED_EMAIL)"
ADMIN_PASSWORD="$(kv ADMIN_SEED_PASSWORD)"
ADMIN_ROLE_ID="$(kv ADMIN_SEED_ROLE_ID)"
SUFFIX="$(date +%s)"
NEW_EMAIL="smoke-${SUFFIX}@toka.local"

step() { echo "[smoke] $*"; }
fail() { echo "[smoke] FAIL: $*" >&2; exit 1; }
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=eval("("+process.argv[1]+")")(JSON.parse(s));process.stdout.write(v===undefined?"":String(v))}catch(e){process.exit(2)}})' "$1"; }

# call METHOD PATH [JSON_BODY] [TOKEN] -> sets HTTP_CODE and BODY
call() {
  local method="$1" path="$2" body="${3:-}" token="${4:-}" out
  local args=(-s -o - -w $'\n%{http_code}' -X "$method" "$BASE$path" -H 'content-type: application/json')
  [ -n "$token" ] && args+=(-H "authorization: Bearer $token")
  [ -n "$body" ] && args+=(--data "$body")
  out="$(curl "${args[@]}")" || fail "curl $method $path"
  HTTP_CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

step "healthz"
call GET /healthz; [ "$HTTP_CODE" = 200 ] || fail "/healthz -> $HTTP_CODE"

step "login admin ($ADMIN_EMAIL)"
LOGIN_JSON="$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.argv[2]}))' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
# El admin se siembra de forma asincrona al arrancar user-service: reintenta un rato.
TOKEN=""
for i in $(seq 1 30); do
  call POST /api/auth/login "$LOGIN_JSON"
  if [ "$HTTP_CODE" = 200 ]; then TOKEN="$(printf '%s' "$BODY" | jget 'j=>j.accessToken')"; break; fi
  [ "$HTTP_CODE" = 429 ] && sleep 15 || sleep 5
done
[ -n "$TOKEN" ] || fail "login admin -> $HTTP_CODE"

step "crear usuario $NEW_EMAIL con rol admin"
NEW_JSON="$(node -e 'process.stdout.write(JSON.stringify({name:"Smoke User",email:process.argv[1],password:process.argv[2],roleId:process.argv[3]}))' "$NEW_EMAIL" "Smoke-${SUFFIX}-Pass" "$ADMIN_ROLE_ID")"
call POST /api/users "$NEW_JSON" "$TOKEN"
[ "$HTTP_CODE" = 201 ] || [ "$HTTP_CODE" = 200 ] || fail "POST /api/users -> $HTTP_CODE: $BODY"
USER_ID="$(printf '%s' "$BODY" | jget 'j=>j.id')"
[ -n "$USER_ID" ] || fail "respuesta sin id"

step "listar usuarios"
call GET "/api/users?page=1&limit=100" "" "$TOKEN"
[ "$HTTP_CODE" = 200 ] || fail "GET /api/users -> $HTTP_CODE"
FOUND="$(printf '%s' "$BODY" | jget "j=>j.items.some(u=>u.id==='$USER_ID')")"
[ "$FOUND" = true ] || fail "usuario creado no aparece en el listado"

step "esperar user.created en /api/audit/events"
OK=""
for i in $(seq 1 20); do
  call GET "/api/audit/events?type=user.created&limit=100" "" "$TOKEN"
  if [ "$HTTP_CODE" = 200 ]; then
    N="$(printf '%s' "$BODY" | jget "j=>(j.items||[]).filter(e=>JSON.stringify(e).includes('$USER_ID')).length")"
    if [ "${N:-0}" -ge 1 ]; then OK=1; break; fi
  fi
  sleep 2
done
[ -n "$OK" ] || fail "no hay eventos user.created en auditoria (ultimo HTTP $HTTP_CODE)"

step "preguntar al agente (proveedor mock)"
call POST /api/agent/ask '{"question":"Cuantos usuarios hay y que puede hacer un administrador?"}' "$TOKEN"
[ "$HTTP_CODE" = 200 ] || fail "POST /api/agent/ask -> $HTTP_CODE: $BODY"
ANSWER="$(printf '%s' "$BODY" | jget 'j=>j.answer')"
[ -n "$ANSWER" ] || fail "respuesta del agente sin 'answer'"

step "OK: login, alta de usuario, listado, auditoria y agente funcionan de extremo a extremo"
