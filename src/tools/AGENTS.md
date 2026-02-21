# src/tools/ — MCP Tool Registrations

Four files, each exporting `register*Tools(server: McpServer, api: PaperlessAPI)`.
16 tools total. Called from `src/index.ts`.

## PATTERN

```typescript
server.registerTool(
	'tool_name',
	{ description: '...', inputSchema: {/* zod v4 schemas */} },
	async (args, _extra) => {
		return jsonResult(await api.someMethod(args));
	},
);
```

- **`import * as z from 'zod/v4'`** — not `import { z } from 'zod'`.
- **`_extra` parameter required** — SDK's `ToolCallback` signature demands it.
  Zero-arg tools: `async (_extra) => ...`. With-args tools: `async (args, _extra) => ...`.
- **Return `CallToolResult`** — `{ content: [{ type: 'text' as const, text: string }] }`.
  The `jsonResult()` helper wraps this.

## GOTCHAS

- **`jsonResult()` duplicated** in all 4 files. Identical 3-line function.
  Extract to shared module if adding more tool files.
- **No cross-imports** between tool files. Each only imports from `../api/paperless-api`.
- **`matching_algorithm` inconsistency**: tags use `z.number().int().min(0).max(4)`,
  correspondents/documentTypes use `z.enum(['any', 'all', ...])`. Upstream API mismatch.
- **No tests** for tool registration or callback logic. Only the API client is tested.
