# Setta JSON Render App Generation Plugin

This first-party plugin is the extraction target for the app subsystem.

Current state:
- `enabledByDefault` remains `false`
- the manifest is discoverable through the plugin runtime
- when enabled, the host now restores the current app HTTP routes, MCP tools,
  chat-mode prompt contributions, and capability-gated frontend surfaces
  through this plugin boundary
- app ownership still lives in core packages for now; later phases move those
  implementations under this plugin package

Later phases will move app routes, MCP tools, deployment/runtime ownership, and frontend/runtime UI behind this package.
