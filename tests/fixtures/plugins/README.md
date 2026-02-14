## Plugin Fixture Suite

Canonical first-party fixture plugins used by tests and docs:

- `backend/`: backend-only plugin with Python entrypoint that registers one plugin route and one MCP tool.
- `backend-codegen/`: backend-only plugin that registers a worker-based codegen target.
- `frontend/`: frontend-only plugin with prebuilt ESM/CSS and section/pane/command registration.
- `content/`: content-only plugin with blueprint/template/prompt payloads.
- `full/`: full plugin (backend + frontend + content + config schema).

Each fixture is intentionally minimal but valid for `setta plugins validate`.
