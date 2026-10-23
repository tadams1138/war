#!/usr/bin/env bash
set -euo pipefail

renderer=war-infra/scripts/render-spec.sh
fixtures=$(mktemp -d)
trap 'rm -rf "$fixtures"' EXIT
failures=0

check() {
  local name=$1
  shift
  if (set -e; "$@"); then
    printf 'ok %s\n' "$name"
  else
    printf 'FAIL %s\n' "$name"
    failures=$((failures + 1))
  fi
}

substitutes_upper_placeholders() {
  # // Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  printf 'tag: ${IMAGE_TAG}\n' > "$dir/template"
  printf 'tag: abc\n' > "$dir/expected"
  # // Act
  IMAGE_TAG=abc bash "$renderer" "$dir/template" "$dir/output" || return 1
  # // Assert
  cmp "$dir/expected" "$dir/output"
}

leaves_bare_dollar_vars() {
  # // Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  printf 'echo "$DATABASE_CA_CERT"\n' > "$dir/template"
  # // Act
  DATABASE_CA_CERT=x bash "$renderer" "$dir/template" "$dir/output" || return 1
  # // Assert
  cmp "$dir/template" "$dir/output"
}

leaves_platform_bindings() {
  # // Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  printf 'value: ${db.DATABASE_URL}\n' > "$dir/template"
  # // Act
  bash "$renderer" "$dir/template" "$dir/output" || return 1
  # // Assert
  cmp "$dir/template" "$dir/output"
}

fails_naming_empty_var() {
  # // Arrange
  local dir status=0
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  printf 'a: ${FOO}\nb: ${BAR}\n' > "$dir/template"
  # // Act
  FOO=1 BAR= bash "$renderer" "$dir/template" "$dir/output" 2> "$dir/stderr" || status=$?
  # // Assert
  cat "$dir/stderr"
  [ "$status" -eq 1 ] &&
    grep -Fq 'render-spec: BAR is unset or empty' "$dir/stderr" &&
    [ ! -e "$dir/output" ]
}

renders_real_templates_completely() {
  # // Arrange
  local dir template placeholder name
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  for template in war-infra/platform/staging.yaml war-infra/platform/production.yaml; do
    while IFS= read -r placeholder; do
      name=${placeholder:2:${#placeholder}-3}
      export "$name=dummy"
    done < <(grep -oE '\$\{[A-Z][A-Z0-9_]*\}' "$template" | sort -u)
    # // Act
    bash "$renderer" "$template" "$dir/output" || return 1
    # // Assert
    if grep -qE '\$\{[A-Z]' "$dir/output"; then return 1; fi
    grep -Fq '"$DATABASE_CA_CERT"' "$dir/output" || return 1
  done
}

check substitutes_upper_placeholders substitutes_upper_placeholders
check leaves_bare_dollar_vars leaves_bare_dollar_vars
check leaves_platform_bindings leaves_platform_bindings
check fails_naming_empty_var fails_naming_empty_var
check renders_real_templates_completely renders_real_templates_completely
[ "$failures" -eq 0 ]
