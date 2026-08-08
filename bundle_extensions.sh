#!/usr/bin/env bash

# Copies this repository's own extensions into the packaged application so they
# ship as built-in extensions.
#
# They are bundled here with esbuild instead of being placed in vscode/extensions
# and handed to VS Code's own extension pipeline. That pipeline expects its
# source layout and compiles every extension with the workbench, whereas these
# are self-contained single-file bundles that only need to be copied in. Running
# after packaging also keeps them out of the compile job's artifact.
#
# Must run after the application has been packaged and before the installers are
# built, otherwise the copy lands in a directory nothing reads any more.

set -e

BUNDLED_EXTENSIONS=( "brynvok-ollama" )

if [[ "${OS_NAME}" == "osx" ]]; then
  NAME_SHORT="$( node -p "require(\"./vscode/product.json\").nameShort" )"
  APP_EXTENSIONS_DIR="VSCode-darwin-${VSCODE_ARCH}/${NAME_SHORT}.app/Contents/Resources/app/extensions"
elif [[ "${OS_NAME}" == "windows" ]]; then
  APP_EXTENSIONS_DIR="VSCode-win32-${VSCODE_ARCH}/resources/app/extensions"
else
  APP_EXTENSIONS_DIR="VSCode-linux-${VSCODE_ARCH}/resources/app/extensions"
fi

if [[ ! -d "${APP_EXTENSIONS_DIR}" ]]; then
  echo "No packaged application at ${APP_EXTENSIONS_DIR}." >&2
  exit 1
fi

for EXTENSION in "${BUNDLED_EXTENSIONS[@]}"; do
  SOURCE_DIR="extensions/${EXTENSION}"

  if [[ ! -f "${SOURCE_DIR}/package.json" ]]; then
    echo "No extension at ${SOURCE_DIR}." >&2
    exit 1
  fi

  echo "Building ${EXTENSION}"
  ( cd "${SOURCE_DIR}" && npm ci && npm run build )

  if [[ ! -f "${SOURCE_DIR}/dist/extension.js" ]]; then
    echo "${EXTENSION} produced no bundle." >&2
    exit 1
  fi

  TARGET_DIR="${APP_EXTENSIONS_DIR}/${EXTENSION}"

  echo "Installing ${EXTENSION} into ${TARGET_DIR}"
  rm -rf "${TARGET_DIR}"
  mkdir -p "${TARGET_DIR}"

  # Only what the extension host reads at runtime. Sources, the lock file and
  # the build script would just enlarge every installer.
  cp -r "${SOURCE_DIR}/dist" "${TARGET_DIR}/"
  cp -r "${SOURCE_DIR}/media" "${TARGET_DIR}/"
  cp "${SOURCE_DIR}/package.json" "${TARGET_DIR}/"
  cp "${SOURCE_DIR}/LICENSE" "${TARGET_DIR}/"
done
