#!/usr/bin/env bash
set -euo pipefail

pruner=$PWD/war-infra/scripts/prune-registry.sh
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

# Builds a fixture directory holding a stub `doctl` on PATH. The stub answers
# the three read commands from files in the directory and records every other
# invocation in "calls", so a test can assert what was (not) changed.
new_case() {
  local dir=$1
  mkdir -p "$dir/bin"
  : > "$dir/calls"
  printf 'app-stg war-staging\napp-prd war-production\n' > "$dir/apps"
  # Newest first is NOT assumed: the script must sort by updated time.
  printf '%s\n' \
    'old1 2026-01-01 00:00:00 +0000 UTC' \
    'bootstrap 2025-12-01 00:00:00 +0000 UTC' \
    'prev 2026-03-01 00:00:00 +0000 UTC' \
    'old2 2026-02-01 00:00:00 +0000 UTC' \
    'stg 2026-05-01 00:00:00 +0000 UTC' \
    'prd 2026-04-01 00:00:00 +0000 UTC' > "$dir/tags"
  printf 'services:\n- image:\n    repository: war-api\n    tag: stg\n' > "$dir/spec-app-stg"
  printf 'services:\n- image:\n    repository: war-api\n    tag: prd\n' > "$dir/spec-app-prd"
  cat > "$dir/bin/doctl" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "apps list "*) cat "$STUB_DIR/apps" ;;
  "apps spec get "*) cat "$STUB_DIR/spec-$4" ;;
  "registry repository list-tags "*) cat "$STUB_DIR/tags" ;;
  "registry garbage-collection get-active "*) [ -s "$STUB_DIR/active" ] && cat "$STUB_DIR/active" ;;
  *) printf '%s\n' "$*" >> "$STUB_DIR/calls" ;;
esac
STUB
  chmod +x "$dir/bin/doctl"
}

run_pruner() {
  local dir=$1
  shift
  STUB_DIR=$dir PATH="$dir/bin:$PATH" bash "$pruner" "$@"
}

keeps_in_use_previous_and_bootstrap_and_deletes_the_rest() {
  # Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  # Act
  run_pruner "$dir" > "$dir/stdout" || return 1
  # Assert
  cat "$dir/calls"
  grep -Fxq 'registry repository delete-tag war-api old2 old1 --force' "$dir/calls" &&
    grep -Fxq 'registry garbage-collection start war --include-untagged-manifests --force' "$dir/calls"
}

keeps_every_tag_an_environment_runs() {
  # Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  printf 'jobs:\n- image:\n    repository: war-api\n    tag: stg\n- image:\n    repository: war-api\n    tag: old2\n' > "$dir/spec-app-stg"
  # Act
  run_pruner "$dir" > "$dir/stdout" || return 1
  # Assert
  cat "$dir/calls"
  grep -Fxq 'registry repository delete-tag war-api old1 --force' "$dir/calls"
}

aborts_without_deleting_when_a_running_tag_is_unreadable() {
  # Arrange
  local dir status=0
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  printf 'services: []\n' > "$dir/spec-app-prd"
  # Act
  run_pruner "$dir" > "$dir/stdout" 2> "$dir/stderr" || status=$?
  # Assert
  cat "$dir/stderr"
  [ "$status" -eq 1 ] &&
    grep -Fq 'prune-registry: cannot read the tag production runs' "$dir/stderr" &&
    [ ! -s "$dir/calls" ]
}

aborts_without_deleting_when_an_app_is_missing() {
  # Arrange
  local dir status=0
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  printf 'app-prd war-production\n' > "$dir/apps"
  # Act
  run_pruner "$dir" > "$dir/stdout" 2> "$dir/stderr" || status=$?
  # Assert
  cat "$dir/stderr"
  [ "$status" -eq 1 ] &&
    grep -Fq 'prune-registry: cannot find the war-staging app' "$dir/stderr" &&
    [ ! -s "$dir/calls" ]
}

dry_run_lists_deletions_and_changes_nothing() {
  # Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  # Act
  run_pruner "$dir" --dry-run > "$dir/stdout" || return 1
  # Assert
  cat "$dir/stdout"
  grep -Fq 'would delete: old1' "$dir/stdout" &&
    grep -Fq 'would delete: old2' "$dir/stdout" &&
    ! grep -Fq 'would delete: prev' "$dir/stdout" &&
    [ ! -s "$dir/calls" ]
}

skips_garbage_collection_when_one_is_active() {
  # Arrange
  local dir
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  printf 'gc-uuid
' > "$dir/active"
  # Act
  run_pruner "$dir" > "$dir/stdout" || return 1
  # Assert
  cat "$dir/stdout" "$dir/calls"
  grep -Fxq 'registry repository delete-tag war-api old2 old1 --force' "$dir/calls" &&
    ! grep -Fq 'garbage-collection start' "$dir/calls" &&
    grep -Fq 'garbage collection already running' "$dir/stdout"
}

rejects_unknown_arguments() {
  # Arrange
  local dir status=0
  dir=$(mktemp -d "$fixtures/case.XXXXXX")
  new_case "$dir"
  # Act
  run_pruner "$dir" --bogus > "$dir/stdout" 2> "$dir/stderr" || status=$?
  # Assert
  [ "$status" -eq 2 ] && [ ! -s "$dir/calls" ]
}

check keeps_in_use_previous_and_bootstrap_and_deletes_the_rest keeps_in_use_previous_and_bootstrap_and_deletes_the_rest
check keeps_every_tag_an_environment_runs keeps_every_tag_an_environment_runs
check aborts_without_deleting_when_a_running_tag_is_unreadable aborts_without_deleting_when_a_running_tag_is_unreadable
check aborts_without_deleting_when_an_app_is_missing aborts_without_deleting_when_an_app_is_missing
check dry_run_lists_deletions_and_changes_nothing dry_run_lists_deletions_and_changes_nothing
check skips_garbage_collection_when_one_is_active skips_garbage_collection_when_one_is_active
check rejects_unknown_arguments rejects_unknown_arguments
[ "$failures" -eq 0 ]
