#!/usr/bin/env bash
# Git credential helper that bridges WSL git to the Windows gh.exe keyring.
# Configured via: git config --local credential.helper '!./scripts/git-credential-gh.sh'
# Active gh account must be SnehaChouksey (see .githooks/pre-commit identity rule).
set -eu

OP="${1:-}"
if [ "$OP" != "get" ]; then
  exit 0
fi

GH="/mnt/c/Program Files/GitHub CLI/gh.exe"
if [ ! -x "$GH" ]; then
  exit 0
fi

TOKEN="$("$GH" auth token --hostname github.com 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  exit 0
fi

printf 'username=SnehaChouksey\n'
printf 'password=%s\n' "$TOKEN"
