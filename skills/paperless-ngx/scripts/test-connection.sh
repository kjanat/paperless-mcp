#!/usr/bin/env bash
set -euo pipefail

# Test Paperless-NGX API connectivity and authentication.
# Usage: test-connection.sh <base_url> <api_token>
# Example: test-connection.sh https://docs.example.com abc123token

if [[ $# -lt 2 ]]; then
	echo "Usage: $0 <base_url> <api_token>" >&2
	echo "Example: $0 https://docs.example.com abc123token" >&2
	exit 1
fi

BASE_URL="${1%/}"
TOKEN="$2"

echo "Testing connection to ${BASE_URL}..."

# 1. Basic connectivity
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
	--max-time 10 \
	"${BASE_URL}/api/" 2>/dev/null) || {
	echo "FAIL: Cannot reach ${BASE_URL} (network error or timeout)" >&2
	exit 1
}

if [[ "${HTTP_CODE}" == "000" ]]; then
	echo "FAIL: Cannot reach ${BASE_URL} (DNS or connection refused)" >&2
	exit 1
fi

echo "  Reachable (HTTP ${HTTP_CODE})"

# 2. Authentication
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
	--max-time 10 \
	-H "Authorization: Token ${TOKEN}" \
	-H "Accept: application/json; version=5" \
	"${BASE_URL}/api/documents/" 2>/dev/null)

if [[ "${AUTH_CODE}" == "401" || "${AUTH_CODE}" == "403" ]]; then
	echo "FAIL: Authentication failed (HTTP ${AUTH_CODE}). Check API token." >&2
	exit 1
fi

if [[ "${AUTH_CODE}" != "200" ]]; then
	echo "FAIL: Unexpected status ${AUTH_CODE} from documents endpoint." >&2
	exit 1
fi

echo "  Authenticated (HTTP ${AUTH_CODE})"

# 3. Quick stats
RESPONSE=$(curl -s --max-time 10 \
	-H "Authorization: Token ${TOKEN}" \
	-H "Accept: application/json; version=5" \
	"${BASE_URL}/api/documents/?page_size=1" 2>/dev/null)

DOC_COUNT=$(echo "${RESPONSE}" | grep -o '"count":[0-9]*' | head -1 | cut -d: -f2)
echo "  Documents: ${DOC_COUNT:-unknown}"

TAG_RESPONSE=$(curl -s --max-time 10 \
	-H "Authorization: Token ${TOKEN}" \
	-H "Accept: application/json; version=5" \
	"${BASE_URL}/api/tags/" 2>/dev/null)

TAG_COUNT=$(echo "${TAG_RESPONSE}" | grep -o '"count":[0-9]*' | head -1 | cut -d: -f2)
echo "  Tags: ${TAG_COUNT:-unknown}"

echo "OK: Connection successful."
