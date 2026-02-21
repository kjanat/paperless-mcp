# src/tools/ — MCP Tool Registrations

Four tool files + shared `utils.ts`. Each tool file exports
`register*Tools(server: McpServer, api: PaperlessAPI)`.
16 tools total. Called from `createServer()` in `src/index.ts`.

## PATTERN

```typescript
import { z } from 'zod';
import { jsonResult } from './utils';

server.registerTool(
	'tool_name',
	{ description: '...', inputSchema: {/* zod schemas */} },
	async (args, _extra) => {
		return jsonResult(await api.someMethod(args));
	},
);
```

- **`import { z } from 'zod'`** — not `import * as z from 'zod/v4'`.
- **`_extra` parameter required** — SDK's `ToolCallback` signature demands it.
  Zero-arg tools: `async (_extra) => ...`. With-args tools: `async (args, _extra) => ...`.
- **Return `CallToolResult`** — via shared `jsonResult()` from `./utils.ts`.
- **`matching_algorithm` is integer (0-6)** — validated via
  `z.number().int().min(0).max(6)` across all endpoints.

## FILES

| File                | Tools | Exports                      |
| ------------------- | ----- | ---------------------------- |
| `utils.ts`          | —     | `jsonResult()` helper        |
| `documents.ts`      | 5     | `registerDocumentTools`      |
| `tags.ts`           | 5     | `registerTagTools`           |
| `correspondents.ts` | 3     | `registerCorrespondentTools` |
| `documentTypes.ts`  | 3     | `registerDocumentTypeTools`  |

## GOTCHAS

- **No cross-imports** between tool files. Each imports from `../api/paperless-api`
  and `./utils` only.
- **No tests** for tool registration or callback logic. Only the API client is tested.
