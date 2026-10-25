#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'Usage: render-spec.sh <template> <output>\n' >&2
  exit 2
fi

template=$1
output=$2
# grep returns 1 for templates without substitutable placeholders.
list=$( { grep -oE '\$\{[A-Z][A-Z0-9_]*\}' "$template" || [ "$?" -eq 1 ]; } | sort -u)
missing=0
for placeholder in $list; do
  name=${placeholder:2:${#placeholder}-3}
  if [ -z "${!name:-}" ]; then
    printf 'render-spec: %s is unset or empty\n' "$name" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  exit 1
fi

temporary=$(mktemp "${output}.XXXXXX")
trap 'rm -f "$temporary"' EXIT
# Git Bash's native envsubst emits CRLF; keep rendered YAML consistent as LF.
envsubst "$list" < "$template" | sed $'s/\r$//' > "$temporary"
mv "$temporary" "$output"
