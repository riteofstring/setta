# Setta JSON Render App Generation Plugin

This first-party plugin is the extraction target for the app subsystem.

Current state:
- `enabledByDefault` remains `false`
- the manifest is discoverable through the plugin runtime
- no app surfaces are exported yet, so disabled and absent still behave the same

Later phases will move app routes, MCP tools, chat modes, and frontend/runtime UI behind this package.
