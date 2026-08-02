# backend-mcp-tools

Go-backed backend-MCP fixture plugin.

- Purpose: prove that Go-native backend plugins can register MCP tools through
  the live app runtime.
- Capabilities: `registerMcpTools`.
- Behavior: exposes one read tool and one write tool over stdio MCP.

Manual smoke:

```bash
scripts/plugin-fixtures/link.sh backend-mcp-tools
```
