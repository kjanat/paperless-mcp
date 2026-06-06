#!/usr/bin/env bash

set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"
: "${GITHUB_ENV:?GITHUB_ENV must be set}"

name=$(bun pm pkg get name | tr -d '"')
version=$(bun pm pkg get version | tr -d '"')

npm_version=$(tr -d '[:space:]' <.npm-version)

printf 'name=%s\n' "${name}" >>"${GITHUB_OUTPUT}"
printf 'version=%s\n' "${version}" >>"${GITHUB_OUTPUT}"
printf 'NPM_VERSION=%s\n' "${npm_version}" >>"${GITHUB_ENV}"
