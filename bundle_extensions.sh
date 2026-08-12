#!/usr/bin/env bash

# Copies this repository's own extensions into the packaged application so they
# ship as built-in extensions.
#
# Code extensions are bundled here with esbuild instead of being placed in
# vscode/extensions and handed to VS Code's own extension pipeline. That
# pipeline expects its source layout and compiles every extension with the
# workbench, whereas these are self-contained packages that only need to be
# copied in. Theme-only packages skip the build step. Running after packaging
# also keeps them out of the compile job's artifact.
#
# Must run after the application has been packaged and before the installers are
# built, otherwise the copy lands in a directory nothing reads any more.

set -e

BUNDLED_EXTENSIONS=( "brynvok-theme" "brynvok-ollama" )

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

  HAS_MAIN="$( node -p "Boolean(require('./${SOURCE_DIR}/package.json').main)" )"
  HAS_BUILD="$( node -p "Boolean(require('./${SOURCE_DIR}/package.json').scripts && require('./${SOURCE_DIR}/package.json').scripts.build)" )"

  if [[ "${HAS_MAIN}" == "true" && "${HAS_BUILD}" == "true" ]]; then
    echo "Building ${EXTENSION}"
    ( cd "${SOURCE_DIR}" && npm ci && npm run build )

    if [[ ! -f "${SOURCE_DIR}/dist/extension.js" ]]; then
      echo "${EXTENSION} produced no bundle." >&2
      exit 1
    fi
  else
    echo "Packaging ${EXTENSION} (no compile step)"
  fi

  TARGET_DIR="${APP_EXTENSIONS_DIR}/${EXTENSION}"

  echo "Installing ${EXTENSION} into ${TARGET_DIR}"
  rm -rf "${TARGET_DIR}"
  mkdir -p "${TARGET_DIR}"

  # Only what the extension host reads at runtime. Sources, the lock file and
  # the build script would just enlarge every installer.
  cp "${SOURCE_DIR}/package.json" "${TARGET_DIR}/"
  cp "${SOURCE_DIR}/LICENSE" "${TARGET_DIR}/"

  for DIR in dist media themes; do
    if [[ -d "${SOURCE_DIR}/${DIR}" ]]; then
      cp -r "${SOURCE_DIR}/${DIR}" "${TARGET_DIR}/"
    fi
  done
done
