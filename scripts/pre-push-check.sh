#!/usr/bin/env bash
# Run from repo root before the first git push.
# Usage: bash scripts/pre-push-check.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking .env is ignored..."
if [[ ! -d .git ]]; then
  echo "    Not a git repo yet — run 'git init' before pushing."
elif [[ -f .env ]]; then
  if ! git check-ignore -q .env; then
    echo "ERROR: .env exists but is not gitignored. Fix .gitignore before pushing." >&2
    exit 1
  fi
  echo "    .env present locally and ignored (OK)"
else
  echo "    No .env file (OK)"
fi

echo "==> pnpm lint"
pnpm lint

echo "==> pnpm typecheck"
pnpm typecheck

echo "==> pnpm build"
pnpm build

echo "==> pnpm generate:openapi"
pnpm generate:openapi

echo "==> pnpm test"
pnpm test

echo ""
echo "All checks passed. Safe to commit and push."
echo "Optional: scan for secrets with gitleaks or GitHub secret scanning after push."
