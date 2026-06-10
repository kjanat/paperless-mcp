# src/tools/ — MCP Tool Registrations

Seven tool files + shared `utils.ts`. Each tool file exports
`register*Tools(server: McpServer, api: PaperlessAPI)`.
33 tools total across 7 domains. Called from `createServer()` in `src/index.ts`.

## PATTERN

```typescript
import { jsonResult } from '#tools/utils';
import { z } from 'zod';

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
- **`matching_algorithm` is integer (0-6)** — validated via the generated
  `zMatchingAlgorithm` schema (`@/api/generated/zod.gen`) across all endpoints,
  not a repeated inline `z.number()`.
- **Object IDs are strict**: every scalar ID/array-of-IDs param uses
  `z.number().int().min(1)`; `get_task.task_id` uses `z.uuid()`. Only
  angle params (`degrees`, `rotate`) stay bare `z.number()` — no `.int()`,
  `.min()`, or other constraints.
- **Writable fields derive from generated schemas** — update/create tools pull
  validators from `zPatched*RequestWritable.shape.*` so they can't drift from
  the upstream OpenAPI schema.

## FILES

| File                | Tools | Exports                              |
| ------------------- | ----- | ------------------------------------ |
| `utils.ts`          | —     | `jsonResult()`, `permissionsInput()` |
| `documents.ts`      | 7     | `registerDocumentTools`              |
| `tags.ts`           | 6     | `registerTagTools`                   |
| `correspondents.ts` | 5     | `registerCorrespondentTools`         |
| `documentTypes.ts`  | 5     | `registerDocumentTypeTools`          |
| `storagePaths.ts`   | 4     | `registerStoragePathTools`           |
| `customFields.ts`   | 4     | `registerCustomFieldTools`           |
| `tasks.ts`          | 2     | `registerTaskTools`                  |

## GOTCHAS

- **No cross-imports** between tool files. Import shared modules via subpath
  aliases — `#api/paperless` (the API client) and `#tools/utils` — plus the
  generated/type aliases (`#api/generated/zod.gen`, `#types`) where needed.
- **No tests** for tool registration or callback logic. Only the API client is tested.
