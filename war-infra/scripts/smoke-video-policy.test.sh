#!/usr/bin/env bash
set -euo pipefail

fixtures=$(mktemp -d)
trap 'rm -rf "$fixtures"' EXIT

# Fake curl provides the complete shell-routing contract without a live deployment.
cat > "$fixtures/curl" <<'CURL'
#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == '%{http_code}' ]]; then printf 200; exit; fi
done
if [[ "$*" == *-sSI* ]]; then
  printf 'Content-Type: text/html\nCache-Control: no-store, immutable\n'
  if [[ "${VIDEO_POLICY:-}" == present ]]; then
    printf 'Content-Security-Policy: frame-src https://www.youtube-nocookie.com https://player.vimeo.com\n'
  fi
elif [[ "$*" == */wars/smoke-test-nonexistent/vote* ]]; then
  printf '<html><script src="/assets/app.js"></script></html>'
else
  printf '<html><meta property="og:title" content="War"><script src="/assets/app.js"></script></html>'
fi
CURL
chmod +x "$fixtures/curl"

# // Arrange
status=0
# // Act
PATH="$fixtures:$PATH" VIDEO_POLICY=absent bash war-infra/scripts/smoke-test.sh staging ui-default > "$fixtures/output" 2>&1 || status=$?
# // Assert
if [[ "$status" != 1 ]] || ! grep -Fq 'frame-src' "$fixtures/output"; then
  cat "$fixtures/output"
  echo 'FAIL: a shell without frame-src must fail the smoke check'
  exit 1
fi

# // Arrange
status=0
# // Act
PATH="$fixtures:$PATH" VIDEO_POLICY=present bash war-infra/scripts/smoke-test.sh staging ui-default > "$fixtures/output" 2>&1 || status=$?
# // Assert
if [[ "$status" != 0 ]]; then cat "$fixtures/output"; exit 1; fi
echo 'ok shell video frame policy smoke checks'
