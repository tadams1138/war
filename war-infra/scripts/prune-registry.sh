#!/usr/bin/env bash
#
# Prune old war-api images from the container registry.
#
# Usage:
#   prune-registry.sh [--dry-run]
#
# Deletes every war-api tag except: the tags the staging and production apps
# run (read from their live specs), the previous tag (the most recent other tag
# by updated time, kept for rollback) and `bootstrap`. Then starts garbage
# collection, which makes the registry read-only for a few minutes, so never
# run this while an image is being built or pushed.
#
# Refuses to delete anything unless both environments' running tags are known.
# --dry-run prints what would be deleted and changes nothing.
#
# Requires an authenticated doctl. WAR_REGISTRY, WAR_REPOSITORY, WAR_STAGING_APP
# and WAR_PRODUCTION_APP override the defaults (war, war-api, war-staging,
# war-production).

set -euo pipefail

registry=${WAR_REGISTRY:-war}
repository=${WAR_REPOSITORY:-war-api}
staging_app=${WAR_STAGING_APP:-war-staging}
production_app=${WAR_PRODUCTION_APP:-war-production}

fail() {
  printf 'prune-registry: %s\n' "$1" >&2
  exit 1
}

# app_id <app name>: the App Platform id of the named app, empty if absent.
app_id() {
  doctl apps list --format ID,Spec.Name --no-header | tr -d '\r' |
    awk -v name="$1" '$2 == name { print $1; exit }'
}

# running_tags <app name>: every tag of the repository in the app's spec.
running_tags() {
  local id
  id=$(app_id "$1")
  [ -n "$id" ] || fail "cannot find the $1 app"
  doctl apps spec get "$id" | tr -d '\r' |
    awk -v repo="$repository" '
      $1 == "repository:" && $2 == repo { want = 1; next }
      want && $1 == "tag:" { print $2; want = 0 }'
}

# tag_times: reads list-tags output on stdin and prints "tag updated-at" lines.
# doctl's list-tags ignores --format and --no-header, so the timestamp is found
# by pattern rather than by column, and the header (no timestamp) is dropped.
tag_times() {
  awk 'match($0, /[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]/) {
    print $1, substr($0, RSTART, RLENGTH)
  }'
}

# select_deletions <kept tag>...: reads "tag updated-at" lines on stdin and
# prints the tags to delete. The newest tag that is not kept
# is the rollback image and is kept too.
select_deletions() {
  sort -k2 -r | awk -v kept=" $* " '
    { tag = $1 }
    index(kept, " " tag " ") { next }
    !previous { previous = 1; next }
    { print tag }'
}

# require_tags <environment> <app name>: prints the app's running tags, or
# aborts when there are none.
require_tags() {
  local tags
  tags=$(running_tags "$2")
  [ -n "$tags" ] || fail "cannot read the tag $1 runs"
  printf '%s\n' "$tags"
}

# parse_args <args>...: prints 1 for --dry-run, 0 for no arguments.
parse_args() {
  case "${1:-}" in
    '') printf '0\n' ;;
    --dry-run) printf '1\n' ;;
    *) printf 'Usage: prune-registry.sh [--dry-run]\n' >&2; exit 2 ;;
  esac
}

# delete_tags <dry run> <tag>...
delete_tags() {
  local dry_run=$1
  shift
  if [ "$#" -eq 0 ]; then
    printf 'nothing to delete\n'
  elif [ "$dry_run" -eq 1 ]; then
    printf 'would delete: %s\n' "$@"
  else
    doctl registry repository delete-tag "$repository" "$@" --force
  fi
}

# collect_garbage: starts garbage collection unless one is already running.
collect_garbage() {
  local active
  active=$(doctl registry garbage-collection get-active "$registry" --format UUID --no-header 2>/dev/null || true)
  if [ -n "$active" ]; then
    printf 'garbage collection already running, not starting another\n'
    return 0
  fi
  doctl registry garbage-collection start "$registry" --include-untagged-manifests --force
}

main() {
  local dry_run staging production
  dry_run=$(parse_args "$@")
  staging=$(require_tags staging "$staging_app")
  production=$(require_tags production "$production_app")

  local -a doomed
  # shellcheck disable=SC2086 # the tag lists are whitespace-separated words
  mapfile -t doomed < <(
    doctl registry repository list-tags "$repository" --format Tag,UpdatedAt --no-header |
      tr -d '\r' | tag_times | select_deletions bootstrap $staging $production)

  delete_tags "$dry_run" ${doomed[@]+"${doomed[@]}"}
  if [ "$dry_run" -eq 0 ]; then
    collect_garbage
  fi
}

main "$@"

