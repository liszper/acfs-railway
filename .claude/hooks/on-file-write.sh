#!/bin/bash
# Claude Code Hook — runs on every file write
# 1. UBS bug scanner for supported languages
# 2. Audit log for file mutation tracking

# --- Audit log (always, for all file types) ---
if command -v audit-log >/dev/null 2>&1 && [ -n "$FILE_PATH" ]; then
    audit-log modify "$FILE_PATH" claude &
fi

# --- UBS bug scanner (code files only) ---
if [[ "$FILE_PATH" =~ \.(js|jsx|ts|tsx|mjs|cjs|py|pyw|pyi|c|cc|cpp|cxx|h|hh|hpp|hxx|rs|go|java|rb)$ ]]; then
  echo "Running bug scanner..."
  if ! command -v ubs >/dev/null 2>&1; then
    echo "'ubs' not found in PATH; install it before using this hook." >&2
    exit 0
  fi
  ubs "${PROJECT_DIR}" --ci 2>&1 | head -50
fi
