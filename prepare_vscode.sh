#!/usr/bin/env bash
# shellcheck disable=SC1091,2154

set -e

# Sourced here rather than further down so the product.json section can use
# APP_NAME, BINARY_NAME, GH_REPO_PATH and friends. Must not be sourced twice:
# GLOBAL_DIRNAME appends "-insiders" on every pass.
. ./utils.sh

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  cp -rp src/insider/* vscode/
else
  cp -rp src/stable/* vscode/
fi

cp -f LICENSE vscode/LICENSE.txt

cd vscode || { echo "'vscode' dir not found"; exit 1; }

{ set +x; } 2>/dev/null

# {{{ product.json
cp product.json{,.bak}

setpath() {
  local jsonTmp
  { set +x; } 2>/dev/null
  jsonTmp=$( jq --arg 'value' "${3}" "setpath(path(.${2}); \$value)" "${1}.json" )
  echo "${jsonTmp}" > "${1}.json"
  set -x
}

setpath_json() {
  local jsonTmp
  { set +x; } 2>/dev/null
  jsonTmp=$( jq --argjson 'value' "${3}" "setpath(path(.${2}); \$value)" "${1}.json" )
  echo "${jsonTmp}" > "${1}.json"
  set -x
}

# The ../product.json overlay is merged with jq's `*` operator, which merges
# objects recursively and therefore cannot delete anything. Keys that must be
# absent have to be removed here instead.
delpath() {
  local jsonTmp
  { set +x; } 2>/dev/null
  jsonTmp=$( jq "del(.${2})" "${1}.json" )
  echo "${jsonTmp}" > "${1}.json"
  set -x
}

# Project-owned links. Every Help menu entry below is guarded by its product.json
# key in upstream code, so the deletions further down simply hide those entries.
setpath "product" "documentationUrl" "https://github.com/${GH_REPO_PATH}#readme"
setpath "product" "licenseUrl" "https://github.com/${GH_REPO_PATH}/blob/master/LICENSE"
setpath "product" "releaseNotesUrl" "https://github.com/${GH_REPO_PATH}/releases"
setpath "product" "reportIssueUrl" "https://github.com/${GH_REPO_PATH}/issues/new"
setpath "product" "requestFeatureUrl" "https://github.com/${GH_REPO_PATH}/issues/new"

setpath_json "product" "extensionsGallery" '{"serviceUrl": "https://open-vsx.org/vscode/gallery", "itemUrl": "https://open-vsx.org/vscode/item", "latestUrlTemplate": "https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest", "controlUrl": "https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json"}'
setpath_json "product" "linkProtectionTrustedDomains" '["https://open-vsx.org"]'

# Telemetry is compiled out by patches/00-telemetry-disable.patch; this makes the
# product itself declare it, which also short-circuits the telemetry service.
setpath_json "product" "enableTelemetry" 'false'

# Microsoft and GitHub endpoints that upstream ships in product.json.
# aka.ms / go.microsoft.com redirectors, Copilot backends, the speech-to-text
# socket and the webview CDN all resolve to first-party Microsoft services.
delpath "product" "checksumFailMoreInfoUrl"        # go.microsoft.com
delpath "product" "introductoryVideosUrl"          # go.microsoft.com
delpath "product" "keyboardShortcutsUrlLinux"      # go.microsoft.com
delpath "product" "keyboardShortcutsUrlMac"        # go.microsoft.com
delpath "product" "keyboardShortcutsUrlWin"        # go.microsoft.com
delpath "product" "tipsAndTricksUrl"               # go.microsoft.com
delpath "product" "twitterUrl"                     # go.microsoft.com
delpath "product" "privacyStatementUrl"            # go.microsoft.com
delpath "product" "defaultChatAgent"               # api.github.com + aka.ms (Copilot)
delpath "product" "trustedExtensionAuthAccess"     # grants Copilot silent GitHub auth
delpath "product" "builtInExtensionsEnabledWithAutoUpdates"
delpath "product" "voiceWsUrl"                     # falcon-caas.mai.microsoft.com
delpath "product" "agentsTelemetryAppName"
delpath "product" "webviewContentExternalBaseUrlTemplate"  # *.vscode-cdn.net
delpath "product" "aiConfig"
delpath "product" "msftInternalDomains"
delpath "product" "sendASmile"
delpath "product" "experimentsUrl"
delpath "product" "surveys"
delpath "product" "npsSurveyUrl"
delpath "product" "cesSurveyUrl"

if [[ "${DISABLE_UPDATE}" != "yes" ]]; then
  # Must point at infrastructure you control. Left on the VSCodium defaults the
  # updater would offer VSCodium builds to Brynvok Dev users.
  setpath "product" "updateUrl" "${UPDATE_BASE_URL:-https://raw.githubusercontent.com/JJ02345/versions/refs/heads/master}"
  setpath "product" "downloadUrl" "https://github.com/${GH_REPO_PATH}/releases"

  # if [[ "${OS_NAME}" == "windows" ]]; then
  #   setpath_json "product" "win32VersionedUpdate" "true"
  # fi
fi

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  setpath "product" "nameShort" "VSCodium - Insiders"
  setpath "product" "nameLong" "VSCodium - Insiders"
  setpath "product" "applicationName" "codium-insiders"
  setpath "product" "dataFolderName" ".vscodium-insiders"
  setpath "product" "linuxIconName" "vscodium-insiders"
  setpath "product" "quality" "insider"
  setpath "product" "urlProtocol" "vscodium-insiders"
  setpath "product" "serverApplicationName" "codium-server-insiders"
  setpath "product" "serverDataFolderName" ".vscodium-server-insiders"
  setpath "product" "darwinBundleIdentifier" "com.vscodium.VSCodiumInsiders"
  setpath "product" "win32AppUserModelId" "VSCodium.VSCodiumInsiders"
  setpath "product" "win32DirName" "VSCodium Insiders"
  setpath "product" "win32MutexName" "vscodiuminsiders"
  setpath "product" "win32NameVersion" "VSCodium Insiders"
  setpath "product" "win32RegValueName" "VSCodiumInsiders"
  setpath "product" "win32ShellNameShort" "VSCodium Insiders"
  setpath "product" "win32AppId" "{{EF35BB36-FA7E-4BB9-B7DA-D1E09F2DA9C9}"
  setpath "product" "win32x64AppId" "{{B2E0DDB2-120E-4D34-9F7E-8C688FF839A2}"
  setpath "product" "win32arm64AppId" "{{44721278-64C6-4513-BC45-D48E07830599}"
  setpath "product" "win32UserAppId" "{{ED2E5618-3E7E-4888-BF3C-A6CCC84F586F}"
  setpath "product" "win32x64UserAppId" "{{20F79D0D-A9AC-4220-9A81-CE675FFB6B41}"
  setpath "product" "win32arm64UserAppId" "{{2E362F92-14EA-455A-9ABD-3E656BBBFE71}"
  setpath "product" "tunnelApplicationName" "codium-insiders-tunnel"
  setpath "product" "win32TunnelServiceMutex" "vscodiuminsiders-tunnelservice"
  setpath "product" "win32TunnelMutex" "vscodiuminsiders-tunnel"
  setpath "product" "win32ContextMenu.x64.clsid" "90AAD229-85FD-43A3-B82D-8598A88829CF"
  setpath "product" "win32ContextMenu.arm64.clsid" "7544C31C-BDBF-4DDF-B15E-F73A46D6723D"
else
  setpath "product" "nameShort" "${APP_NAME}"
  setpath "product" "nameLong" "${APP_NAME}"
  setpath "product" "applicationName" "${BINARY_NAME}"
  setpath "product" "dataFolderName" ".${APP_NAME_LC}"
  setpath "product" "linuxIconName" "${APP_NAME_LC}"
  setpath "product" "quality" "stable"
  setpath "product" "urlProtocol" "${APP_NAME_LC}"
  setpath "product" "serverApplicationName" "${BINARY_NAME}-server"
  setpath "product" "serverDataFolderName" ".${APP_NAME_LC}-server"
  setpath "product" "darwinBundleIdentifier" "dev.brynvok.BrynvokDev"
  setpath "product" "win32AppUserModelId" "Brynvok.BrynvokDev"
  setpath "product" "win32DirName" "${APP_NAME}"
  setpath "product" "win32MutexName" "brynvokdev"
  setpath "product" "win32NameVersion" "${APP_NAME}"
  setpath "product" "win32RegValueName" "BrynvokDev"
  setpath "product" "win32ShellNameShort" "${APP_NAME}"
  # Generated for Brynvok Dev. These must never be reused from VSCodium or the
  # Windows installer would upgrade/uninstall an existing VSCodium install.
  setpath "product" "win32AppId" "{{EFD7B782-DF66-41B5-B821-DB3684B59A7A}"
  setpath "product" "win32x64AppId" "{{73D2F31C-370C-42A6-92CA-8FD0F76A0D2F}"
  setpath "product" "win32arm64AppId" "{{83D07F08-521F-48A1-8545-68F37065F302}"
  setpath "product" "win32UserAppId" "{{B86B3B29-F95D-4964-AEBE-E1E772336CE5}"
  setpath "product" "win32x64UserAppId" "{{41A94BCD-25A5-4B36-9A61-724A6A0A3436}"
  setpath "product" "win32arm64UserAppId" "{{FA1E2363-442A-4A8E-843F-6C62FE1DA516}"
  setpath "product" "tunnelApplicationName" "${TUNNEL_APP_NAME}"
  setpath "product" "win32TunnelServiceMutex" "brynvokdev-tunnelservice"
  setpath "product" "win32TunnelMutex" "brynvokdev-tunnel"
  setpath "product" "win32ContextMenu.x64.clsid" "5BFD79BC-E8DF-4120-9DFE-C6FAE6839DC3"
  setpath "product" "win32ContextMenu.arm64.clsid" "173EE85C-ACFD-4D32-85CF-AAE37361E18F"
fi

setpath_json "product" "tunnelApplicationConfig" '{}'

jsonTmp=$( jq -s '.[0] * .[1]' product.json ../product.json )
echo "${jsonTmp}" > product.json && unset jsonTmp

cat product.json
# }}}

# {{{ apply patches

echo "APP_NAME=\"${APP_NAME}\""
echo "APP_NAME_LC=\"${APP_NAME_LC}\""
echo "ASSETS_REPOSITORY=\"${ASSETS_REPOSITORY}\""
echo "BINARY_NAME=\"${BINARY_NAME}\""
echo "GH_REPO_PATH=\"${GH_REPO_PATH}\""
echo "GLOBAL_DIRNAME=\"${GLOBAL_DIRNAME}\""
echo "ORG_NAME=\"${ORG_NAME}\""
echo "TUNNEL_APP_NAME=\"${TUNNEL_APP_NAME}\""

if [[ "${DISABLE_UPDATE}" == "yes" ]]; then
  mv ../patches/00-update-disable.patch.yet ../patches/00-update-disable.patch
fi

for file in ../patches/*.json; do
  if [[ -f "${file}" ]]; then
    apply_actions "${file}"
  fi
done

for file in ../patches/*.patch; do
  if [[ -f "${file}" ]]; then
    apply_patch "${file}"
  fi
done

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  for file in ../patches/insider/*.patch; do
    if [[ -f "${file}" ]]; then
      apply_patch "${file}"
    fi
  done
fi

if [[ -d "../patches/${OS_NAME}/" ]]; then
  for file in "../patches/${OS_NAME}/"*.patch; do
    if [[ -f "${file}" ]]; then
      apply_patch "${file}"
    fi
  done
fi

for file in ../patches/user/*.patch; do
  if [[ -f "${file}" ]]; then
    apply_patch "${file}"
  fi
done
# }}}

set -x

# {{{ install dependencies
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [[ "${OS_NAME}" == "linux" ]]; then
  export VSCODE_SKIP_NODE_VERSION_CHECK=1

   if [[ "${npm_config_arch}" == "arm" ]]; then
    export npm_config_arm_version=7
  fi
elif [[ "${OS_NAME}" == "windows" ]]; then
  if [[ "${npm_config_arch}" == "arm" ]]; then
    export npm_config_arm_version=7
  fi
else
  if [[ "${CI_BUILD}" != "no" ]]; then
    clang++ --version
  fi
fi

node build/npm/preinstall.ts

mv .npmrc .npmrc.bak
cp ../npmrc .npmrc

for i in {1..5}; do # try 5 times
  if [[ "${CI_BUILD}" != "no" && "${OS_NAME}" == "osx" ]]; then
    CXX=clang++ npm ci && break
  else
    npm ci && break
  fi

  if [[ $i == 5 ]]; then
    echo "Npm install failed too many times" >&2
    exit 1
  fi
  echo "Npm install failed $i, trying again..."

  sleep $(( 15 * (i + 1)))
done

mv .npmrc.bak .npmrc
# }}}

# package.json
cp package.json{,.bak}

setpath "package" "version" "${RELEASE_VERSION%-insider}"

replace "s|Microsoft Corporation|${ORG_NAME}|" package.json

cp resources/server/manifest.json{,.bak}

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  setpath "resources/server/manifest" "name" "${APP_NAME} - Insiders"
  setpath "resources/server/manifest" "short_name" "${APP_NAME} - Insiders"
else
  setpath "resources/server/manifest" "name" "${APP_NAME}"
  setpath "resources/server/manifest" "short_name" "${APP_NAME}"
fi

# announcements
replace "s|\\[\\/\\* BUILTIN_ANNOUNCEMENTS \\*\\/\\]|$( tr -d '\n' < ../announcements-builtin.json )|" src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts

../undo_telemetry.sh

replace "s|Microsoft Corporation|${ORG_NAME}|" build/lib/electron.ts
replace "s|([0-9]) Microsoft|\\1 ${ORG_NAME}|" build/lib/electron.ts

PRODUCT_HOMEPAGE="https://github.com/${GH_REPO_PATH}"

if [[ "${OS_NAME}" == "linux" ]]; then
  # microsoft adds their apt repo to sources
  # unless the app name is code-oss
  # as we are renaming the application
  # we need to edit a line in the post install template
  if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
    sed -i "s/code-oss/${BINARY_NAME}-insiders/" resources/linux/debian/postinst.template
  else
    sed -i "s/code-oss/${BINARY_NAME}/" resources/linux/debian/postinst.template
  fi

  # fix the packages metadata
  # code.appdata.xml
  sed -i "s|Visual Studio Code|${APP_NAME}|g" resources/linux/code.appdata.xml
  sed -i "s|https://code.visualstudio.com/docs/setup/linux|${PRODUCT_HOMEPAGE}#readme|" resources/linux/code.appdata.xml
  sed -i "s|https://code.visualstudio.com/home/home-screenshot-linux-lg.png|${PRODUCT_HOMEPAGE}|" resources/linux/code.appdata.xml
  sed -i "s|https://code.visualstudio.com|${PRODUCT_HOMEPAGE}|" resources/linux/code.appdata.xml

  # control.template
  sed -i "s|Microsoft Corporation <vscode-linux@microsoft.com>|${ORG_NAME} ${PRODUCT_HOMEPAGE}|"  resources/linux/debian/control.template
  sed -i "s|Visual Studio Code|${APP_NAME}|g" resources/linux/debian/control.template
  sed -i "s|https://code.visualstudio.com/docs/setup/linux|${PRODUCT_HOMEPAGE}#readme|" resources/linux/debian/control.template
  sed -i "s|https://code.visualstudio.com|${PRODUCT_HOMEPAGE}|" resources/linux/debian/control.template

  # code.spec.template
  sed -i "s|Microsoft Corporation|${ORG_NAME}|" resources/linux/rpm/code.spec.template
  sed -i "s|Visual Studio Code Team <vscode-linux@microsoft.com>|${ORG_NAME} ${PRODUCT_HOMEPAGE}|" resources/linux/rpm/code.spec.template
  sed -i "s|Visual Studio Code|${APP_NAME}|" resources/linux/rpm/code.spec.template
  sed -i "s|https://code.visualstudio.com/docs/setup/linux|${PRODUCT_HOMEPAGE}#readme|" resources/linux/rpm/code.spec.template
  sed -i "s|https://code.visualstudio.com|${PRODUCT_HOMEPAGE}|" resources/linux/rpm/code.spec.template
elif [[ "${OS_NAME}" == "windows" ]]; then
  # code.iss
  sed -i "s|https://code.visualstudio.com|${PRODUCT_HOMEPAGE}|" build/win32/code.iss
  sed -i "s|Microsoft Corporation|${ORG_NAME}|" build/win32/code.iss
fi

cd ..
