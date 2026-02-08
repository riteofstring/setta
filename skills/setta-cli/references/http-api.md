# Setta HTTP API notes

Base API prefix:
- `/api`

OpenAPI schema:
- `/api/openapi.json`

Common routes (Route enum keys):
- `GET_LATEST_PROJECT_STATE`
- `LOAD_ALL_PROJECT_METADATA`
- `RUN_DETACHED`
- `GET_RUN_STATUS`
- `CANCEL_RUN`

Bootstrap endpoints:
- `/__setta__/bootstrap`
- `/__setta__/bootstrap/consume`

MCP tool-call endpoint (CLI uses this):
- `/__setta__/tools/call`
  - POST body:
    - Minimal: `{ "tool": "<bare_name>", "arguments": { ... } }`
    - With agentic context:
      `{ "tool": "<bare_name>", "arguments": { ... }, "agenticContext": { ... } }`
  - `agenticContext` fields:
    - `projectConfigId` (required for scope-enforced tool calls)
    - `chatId` (optional)
    - `sectionId` (required unless `allowUnscoped=true`)
    - `allowUnscoped` (optional; set true for Project Chat / full access)
  - Optional agentic context headers:
    - `x-setta-project-config-id`
    - `x-setta-chat-id`
    - `x-setta-section-id` (required unless `x-setta-allow-unscoped: true`)
    - `x-setta-allow-unscoped` (`true`/`false`)

Use the OpenAPI schema to confirm legacy REST payloads and response shapes. For
MCP tool schemas, use `setta tools`.
