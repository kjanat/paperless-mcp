#!/usr/bin/env bash
set -euo pipefail

# Base64-encode a file for use with the post_document MCP tool.
# Outputs JSON with "file" (base64) and "filename" fields ready to paste.
# Usage: encode-file.sh <path>
# Example: encode-file.sh ~/Documents/invoice.pdf

if [[ $# -lt 1 ]]; then
	echo "Usage: $0 <file_path>" >&2
	echo "Example: $0 ~/Documents/invoice.pdf" >&2
	exit 1
fi

FILE_PATH="$1"

if [[ ! -f "${FILE_PATH}" ]]; then
	echo "Error: File not found: ${FILE_PATH}" >&2
	exit 1
fi

FILENAME=$(basename "${FILE_PATH}")
SIZE=$(wc -c <"${FILE_PATH}" | tr -d ' ')

# Warn on large files (>50MB)
if [[ "${SIZE}" -gt 52428800 ]]; then
	echo "Warning: File is $((SIZE / 1048576))MB. Large uploads may be slow." >&2
fi

# Detect base64 flags (GNU vs BSD)
if base64 --help 2>&1 | grep -q '\-w'; then
	B64=$(base64 -w0 "${FILE_PATH}")
else
	B64=$(base64 -i "${FILE_PATH}")
fi

echo "Encoded ${FILENAME} (${SIZE} bytes)"
echo ""
echo "Use with post_document:"
echo "  file: <base64 string, ${#B64} chars>"
echo "  filename: \"${FILENAME}\""
echo ""
echo "--- BASE64 START ---"
echo "${B64}"
echo "--- BASE64 END ---"
