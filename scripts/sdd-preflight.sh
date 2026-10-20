#!/bin/bash
# SDD Preflight v2 — Engram-aware
# Exit 0 = ready (or warnings only), Exit 1 = needs bootstrap or hard block
set -euo pipefail

AGENTS_MD="AGENTS.md"

# --- Repo role (multi-repo aware checks key off this) ---
REPO_ROLE="standalone"
if [ -f ".forge/config.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    REPO_ROLE="$(jq -r '.repo_role // "standalone"' .forge/config.json 2>/dev/null || echo standalone)"
  else
    REPO_ROLE="$(grep -o '"repo_role"[[:space:]]*:[[:space:]]*"[a-z]*"' .forge/config.json 2>/dev/null | sed 's/.*"\([a-z]*\)"$/\1/' || echo standalone)"
    [ -z "$REPO_ROLE" ] && REPO_ROLE="standalone"
  fi
fi
echo "REPO_ROLE=$REPO_ROLE"

# Emit "key<TAB>path" per member from openspec/config.yaml `repos:` block.
# Handles flat (`api: ../api`) and nested (`api:` + `  path: ../api`) forms.
_repos_entries() {
  [ -f "openspec/config.yaml" ] || return 0
  awk '
    /^repos:[[:space:]]*$/ { inblock=1; next }
    inblock && /^[^[:space:]#]/ { exit }
    inblock && /^  [a-zA-Z0-9_-]+:[[:space:]]*[^[:space:]]/ {
      key=$0; sub(/^  /,"",key); sub(/:.*/,"",key)
      val=$0; sub(/^[^:]*:[[:space:]]*/,"",val); sub(/[[:space:]]*#.*$/,"",val); gsub(/["'"'"']/,"",val)
      if (val != "") print key "\t" val; next
    }
    inblock && /^  [a-zA-Z0-9_-]+:[[:space:]]*$/ {
      key=$0; sub(/^  /,"",key); sub(/:.*/,"",key); curkey=key; next
    }
    inblock && curkey != "" && /^    path:/ {
      val=$0; sub(/^[^:]*:[[:space:]]*/,"",val); sub(/[[:space:]]*#.*$/,"",val); gsub(/["'"'"']/,"",val)
      print curkey "\t" val; curkey=""; next
    }
  ' openspec/config.yaml
}

# --- Bootstrap check (role-aware) ---
# Coordination hubs never carry project-stack — their bootstrap-complete signal
# is a rendered hub-repo-map (it gains forge:context:<repo>:<hash> lines when
# Mode 6/6b writes the member rows).
if [ "$REPO_ROLE" = "coordination" ] && [ -f "openspec/config.yaml" ] && grep -q "^repos:" openspec/config.yaml 2>/dev/null; then
  if [ -f "$AGENTS_MD" ] && grep -q "forge:context:" "$AGENTS_MD"; then
    echo "BOOTSTRAP=complete"
  else
    echo "BOOTSTRAP=missing"
    exit 1
  fi
elif [ -f "$AGENTS_MD" ] && grep -q "forge:section:project-stack" "$AGENTS_MD"; then
  echo "BOOTSTRAP=complete"
else
  echo "BOOTSTRAP=missing"
  exit 1
fi

# --- OpenSpec check ---
if [ -d "openspec/changes" ] && [ "$(ls -A openspec/changes 2>/dev/null)" ]; then
  echo "SPECS=available"
else
  echo "SPECS=empty"
fi

# --- Engram (per design decision D4) ---
ENGRAM_REPO_FILE_PRESENT="false"
if [ -d ".engram" ] || [ -f ".engram/engram.db" ] || [ -f "engram.db" ]; then
  ENGRAM_REPO_FILE_PRESENT="true"
fi

if command -v engram &> /dev/null; then
  echo "ENGRAM_BINARY=present"
  if curl -sf http://127.0.0.1:7437/health > /dev/null 2>&1; then
    echo "ENGRAM_SERVER=up"
  else
    echo "ENGRAM_SERVER=down"
  fi
else
  echo "ENGRAM_BINARY=missing"
  if [ "$ENGRAM_REPO_FILE_PRESENT" = "true" ]; then
    cat <<HELP
[ENGRAM] BLOCK: this repo contains .engram/ files but the engram binary is not installed.
Install via:
  brew install gentleman-programming/tap/engram                                     # macOS
  iwr https://github.com/Gentleman-Programming/engram/releases/latest/download/engram-windows-amd64.exe -OutFile engram.exe   # Windows
  go install github.com/Gentleman-Programming/engram/cmd/engram@latest             # any OS with Go 1.22+
Then: claude plugin marketplace add Gentleman-Programming/engram && claude plugin install engram
See agent_docs/engram-install.md for full instructions.
HELP
    exit 1
  fi
  echo "[ENGRAM] WARNING: continuing without persistent memory."
fi

# --- Auto-memory disable hint (D10) ---
if command -v engram &> /dev/null; then
  if [ -z "${CLAUDE_CODE_DISABLE_AUTO_MEMORY:-}" ]; then
    echo "[CLAUDE] WARNING: set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 — Engram is the sole memory source."
  fi
fi

# --- MCP config check (deep) ---
MCP_FILE=""
if [ -f ".mcp.json" ]; then
  MCP_FILE=".mcp.json"
elif [ -f ".claude/mcp.json" ]; then
  MCP_FILE=".claude/mcp.json"
fi

if [ -n "$MCP_FILE" ]; then
  echo "MCP_CONFIG=found"
  # context7 (always required)
  if grep -q "\"context7\"" "$MCP_FILE" 2>/dev/null; then
    echo "CONTEXT7=configured"
  else
    echo "CONTEXT7=absent"
  fi
  # engram (always required at runtime; plugin manages binary)
  if grep -q "\"engram\"" "$MCP_FILE" 2>/dev/null; then
    echo "MCP_engram=configured"
  else
    echo "MCP_engram=absent (plugin install handles this)"
  fi
else
  echo "MCP_CONFIG=missing"
fi

# --- Figma (D3 conditional — only required when frontend_paths populated) ---
FRONTEND_PATHS=$(grep -A 20 "Domain Map" "$AGENTS_MD" 2>/dev/null | grep "frontend_paths" | head -1 || true)
if [ -n "$FRONTEND_PATHS" ] && ! echo "$FRONTEND_PATHS" | grep -qE "(empty|\[\]|: *$)"; then
  if [ -n "$MCP_FILE" ] && grep -q "\"figma\"" "$MCP_FILE" 2>/dev/null; then
    echo "FIGMA=configured"
  else
    echo "FIGMA=absent (REQUIRED — frontend paths detected in Domain Map)"
  fi
else
  echo "FIGMA=skipped (no frontend in domain map)"
fi

# --- agent-browser (D1 default for tester-front + validator + Mode 1) ---
if command -v agent-browser &> /dev/null; then
  echo "AGENT_BROWSER=available"
else
  echo "AGENT_BROWSER=absent (falling back to Playwright CLI for browse skill)"
fi

# --- Playwright CLI (committed test runtime; fallback for agent-browser) ---
if command -v npx &> /dev/null && [ -f "package.json" ] && grep -q "playwright" package.json 2>/dev/null; then
  echo "PLAYWRIGHT_CLI=available"
elif command -v playwright &> /dev/null; then
  echo "PLAYWRIGHT_CLI=available (global)"
else
  echo "PLAYWRIGHT_CLI=absent"
fi

# --- NPX availability ---
if command -v npx &> /dev/null; then
  echo "NPX=available"
else
  echo "NPX=missing"
fi

# --- Spec location check ---
# Warn if spec files exist in openspec/specs/ that also exist in a change folder
if [ -d "openspec/specs" ]; then
  for spec in openspec/specs/*.md; do
    [ -f "$spec" ] || continue
    BASENAME=$(basename "$spec")
    for change_dir in openspec/changes/*/specs/; do
      [ -d "$change_dir" ] || continue
      if [ -f "${change_dir}${BASENAME}" ]; then
        echo "SPEC_WARNING=duplicate_${BASENAME}"
      fi
    done
  done
fi

# --- Section drift (AU-8 — unified with multi-repo context drift) ---
# Compares installed section-marker versions vs the install snapshot
# (.forge/sections.lock) and flags coordination repos carrying member-owned
# sections (SECTIONS=needs-split → Mode 6b migration). Informational only —
# never mutates, never blocks.
if [ -f "scripts/sdd-context-drift.sh" ]; then
  bash scripts/sdd-context-drift.sh --sections 2>/dev/null || echo "SECTIONS=unknown (drift script failed)"
fi

# --- Multi-repo detection ---
if [ -f "openspec/config.yaml" ] && grep -q "repos:" openspec/config.yaml 2>/dev/null; then
  echo "MULTI_REPO=true"

  # --- Member-repo context health (loading-contract layer 3) ---
  # A member is healthy when its own AGENTS.md exists and carries the
  # project-stack section markers. The orchestrator MUST refuse member
  # dispatch while this reports missing — teammates would work blind.
  MISSING_MEMBERS=""
  UNTRUSTED_MEMBERS=""
  CODEX_GLOBAL_CONFIG="${HOME}/.codex/config.toml"
  while IFS=$'\t' read -r REPO_KEY REPO_PATH; do
    [ -n "$REPO_KEY" ] || continue
    if [ ! -f "$REPO_PATH/AGENTS.md" ] || ! grep -q "forge:section:project-stack" "$REPO_PATH/AGENTS.md" 2>/dev/null; then
      MISSING_MEMBERS="${MISSING_MEMBERS:+$MISSING_MEMBERS,}$REPO_KEY"
    fi
    # Codex trust gate (AU-9): untrusted member repos silently drop Forge
    # hooks on first dispatch. Only checked when a Codex global config exists.
    if [ -f "$CODEX_GLOBAL_CONFIG" ]; then
      ABS_PATH="$(cd "$REPO_PATH" 2>/dev/null && pwd || true)"
      if [ -n "$ABS_PATH" ]; then
        if ! grep -A 3 "\"$ABS_PATH\"" "$CODEX_GLOBAL_CONFIG" 2>/dev/null | grep -q 'trust_level[[:space:]]*=[[:space:]]*"trusted"'; then
          UNTRUSTED_MEMBERS="${UNTRUSTED_MEMBERS:+$UNTRUSTED_MEMBERS,}$REPO_KEY"
        fi
      fi
    fi
  done < <(_repos_entries)

  if [ -n "$MISSING_MEMBERS" ]; then
    echo "MEMBER_CONTEXT=missing($MISSING_MEMBERS)"
    echo "[MULTI-REPO] WARNING: member repo(s) without bootstrapped AGENTS.md: $MISSING_MEMBERS — run member install + /sdd Mode 6b before dispatching into them."
  else
    echo "MEMBER_CONTEXT=ok"
  fi
  if [ -f "$CODEX_GLOBAL_CONFIG" ]; then
    if [ -n "$UNTRUSTED_MEMBERS" ]; then
      echo "CODEX_TRUST=missing($UNTRUSTED_MEMBERS)"
      echo "[CODEX] WARNING: Codex trust not granted for: $UNTRUSTED_MEMBERS — Forge hooks inactive there until the project is trusted (open each repo in Codex once and accept)."
    else
      echo "CODEX_TRUST=granted"
    fi
  fi
else
  echo "MULTI_REPO=false"
fi

exit 0
