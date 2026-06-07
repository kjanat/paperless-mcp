#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
	: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"
	: "${GITHUB_ENV:?GITHUB_ENV must be set}"
else
	GITHUB_OUTPUT=/dev/stdout GITHUB_ENV=/dev/stderr
fi

name=$(bun pm pkg get name | tr -d '"')
version=$(bun pm pkg get version | tr -d '"')

npm_version=$(tr -d '[:space:]' <.npm-version)

cat <<-EOF >>"${GITHUB_OUTPUT}"
	name=${name}
	version=${version}
	npm-url=https://npm.im/package/${name}/v/${version}
EOF

cat <<-EOF >>"${GITHUB_ENV}"
	NPM_VERSION=${npm_version}
EOF
