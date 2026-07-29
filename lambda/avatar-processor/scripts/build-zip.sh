#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${AVATAR_DOCKER_BIN:-docker}"
WORK="$(mktemp -d "${ROOT}/.build.XXXXXX")"
DIST="${ROOT}/dist"
OUTPUT="${DIST}/avatar-processor.zip"

cleanup() {
  find "${WORK}" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

if ! "${DOCKER_BIN}" info >/dev/null 2>&1; then
  echo "Docker daemon is required to build the Lambda ZIP" >&2
  exit 1
fi

mkdir -p "${DIST}"
find "${DIST}" -maxdepth 1 -type f -name "avatar-processor.zip" -delete
chmod 0777 "${WORK}"

"${ROOT}/node_modules/.bin/esbuild" "${ROOT}/src/handler.ts" \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=esm \
  --external:sharp \
  --external:@aws-sdk/client-s3 \
  --outfile="${WORK}/index.mjs"

cp "${ROOT}/package.json" "${WORK}/package.json"
cp "${ROOT}/package-lock.linux-x64.json" "${WORK}/package-lock.json"
cp "${ROOT}/scripts/smoke-linux.sh" "${WORK}/"

"${DOCKER_BIN}" run \
  --platform linux/amd64 \
  --rm \
  --entrypoint /bin/bash \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --volume "${WORK}:/var/task" \
  --workdir /var/task \
  public.ecr.aws/lambda/nodejs:24 \
  -lc "npm ci --omit=dev --os=linux --cpu=x64 --libc=glibc && bash smoke-linux.sh"

if [[ -d "${WORK}/node_modules/.bin" ]]; then
  find "${WORK}/node_modules/.bin" -type l -delete
  rmdir "${WORK}/node_modules/.bin"
fi

if find "${WORK}/node_modules" -type l -print -quit | grep -q .; then
  echo "Lambda deployment dependencies must not contain symbolic links" >&2
  exit 1
fi

(
  cd "${WORK}"
  zip -q -r "${OUTPUT}" index.mjs node_modules package.json package-lock.json
)

echo "${OUTPUT}"
