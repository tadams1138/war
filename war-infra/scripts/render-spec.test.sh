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

# The variables .github/workflows/app.yml sets in its "Render app spec" steps.
# Keep in sync with that workflow.
app_variables='FACEBOOK_CLIENT_ID FACEBOOK_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET IMAGE_TAG INTERNAL_TASK_TOKEN JWT_SECRET MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY TWITTER_CLIENT_ID TWITTER_CLIENT_SECRET'

template_variables() {
  grep -oE '\$\{[A-Z][A-Z0-9_]*\}' "$1" | sed 's/^..//; s/.$//' | sort -u | paste -sd ' ' -
}

renders_template_completely() {
  # // Arrange
  local template=$1 dir name
  local -a vars=()
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  for name in $app_variables; do vars+=("$name=dummy"); done
  # // Act
  env -i PATH="$PATH" "${vars[@]}" bash "$renderer" "$template" "$dir/output" || return 1
  # // Assert
  [ "$(template_variables "$template")" = "$app_variables" ] &&
    ! grep -qE '\$\{[A-Z]' "$dir/output" &&
    grep -Fq '"$DATABASE_CA_CERT"' "$dir/output"
}

check substitutes_upper_placeholders substitutes_upper_placeholders
check leaves_bare_dollar_vars leaves_bare_dollar_vars
check leaves_platform_bindings leaves_platform_bindings
check fails_naming_empty_var fails_naming_empty_var
check renders_staging_template_completely renders_template_completely war-infra/platform/staging.yaml
check renders_production_template_completely renders_template_completely war-infra/platform/production.yaml
[ "$failures" -eq 0 ]
