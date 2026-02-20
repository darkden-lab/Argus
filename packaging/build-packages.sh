#!/usr/bin/env bash
set -euo pipefail

# Build system packages for the Argus CLI.
# Usage: ./packaging/build-packages.sh <version>
#   version - semver without leading "v" (e.g. 1.2.3)

VERSION="${1:?usage: build-packages.sh <version>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_DIR="$PROJECT_ROOT/cli"
DIST_DIR="$SCRIPT_DIR/dist"

mkdir -p "$DIST_DIR"

echo "==> Cross-compiling Argus CLI v${VERSION}"

PLATFORMS=(
  "linux/amd64"
  "linux/arm64"
  "darwin/amd64"
  "darwin/arm64"
  "windows/amd64"
)

for PLATFORM in "${PLATFORMS[@]}"; do
  GOOS="${PLATFORM%/*}"
  GOARCH="${PLATFORM#*/}"
  OUTPUT="argus_${GOOS}_${GOARCH}"
  if [ "$GOOS" = "windows" ]; then
    OUTPUT="${OUTPUT}.exe"
  fi

  echo "    Building ${GOOS}/${GOARCH}..."
  (cd "$CLI_DIR" && \
    CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
    go build -trimpath \
      -ldflags "-s -w -X main.version=${VERSION}" \
      -o "$DIST_DIR/$OUTPUT" \
      ./cmd/argus)
done

echo "==> Building .deb and .rpm packages"

for ARCH in amd64 arm64; do
  export VERSION ARCH
  for FORMAT in deb rpm; do
    echo "    ${FORMAT} (${ARCH})..."
    if command -v nfpm >/dev/null 2>&1; then
      nfpm package \
        --config "$SCRIPT_DIR/nfpm.yaml" \
        --packager "$FORMAT" \
        --target "$DIST_DIR/"
    else
      echo "    [SKIP] nfpm not found - install with: go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest"
    fi
  done
done

echo "==> Building Windows installer"

if command -v makensis >/dev/null 2>&1; then
  cp "$DIST_DIR/argus_windows_amd64.exe" "$SCRIPT_DIR/windows/argus.exe"
  makensis -DVERSION="$VERSION" "$SCRIPT_DIR/windows/installer.nsi"
  mv "$SCRIPT_DIR/windows/argus-${VERSION}-windows-amd64-setup.exe" "$DIST_DIR/"
  rm -f "$SCRIPT_DIR/windows/argus.exe"
else
  echo "    [SKIP] makensis not found - install NSIS to build Windows installer"
fi

echo "==> Done. Artifacts in $DIST_DIR/"
ls -lh "$DIST_DIR/"
