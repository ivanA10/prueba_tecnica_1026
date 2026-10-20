#!/bin/sh
# One role + one database per service; no cross-grants (ADR-002).
# Passwords come from the container environment (see docker-compose.yml / .env).
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${AUTH_DB_PASSWORD:?AUTH_DB_PASSWORD is required}"
: "${USER_DB_PASSWORD:?USER_DB_PASSWORD is required}"
: "${ROLE_DB_PASSWORD:?ROLE_DB_PASSWORD is required}"

create_db() {  # $1 = service, $2 = password (from env)
  psql -v ON_ERROR_STOP=1 -v pw="$2" -U "$POSTGRES_USER" -d postgres <<SQL
CREATE ROLE $1_user LOGIN PASSWORD :'pw';
CREATE DATABASE $1_db OWNER $1_user;
REVOKE ALL ON DATABASE $1_db FROM PUBLIC;
GRANT CONNECT ON DATABASE $1_db TO $1_user;
SQL
}

create_db auth "$AUTH_DB_PASSWORD"
create_db user "$USER_DB_PASSWORD"
create_db role "$ROLE_DB_PASSWORD"
