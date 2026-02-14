## Plugin Fixture Suite

Canonical first-party fixture plugins used by tests and docs.

Principles:

- Keep many fixture plugins with intentionally different capabilities and failure modes.
- Use these fixtures for unit, integration, Playwright, and manual smoke testing.
- Keep fixtures production-like: valid manifests, real entrypoints, and deterministic behavior.

Current fixtures:

- `backend/`: backend-only plugin with Python entrypoint that registers one plugin route and one MCP tool.
- `backend-codegen/`: backend-only plugin that registers a worker-based codegen target.
- `backend-external-agent/`: backend-only plugin that registers external agent adapters.
- `backend-language-server/`: backend-only plugin that registers a language server.
- `backend-language-server-e2e/`: backend-only plugin for end-to-end language server UI/behavior testing.
- `backend-mcp-tools/`: backend-only plugin that registers multiple MCP tools.
- `backend-static-router/`: backend-only plugin that registers both API router and static directory.
- `backend-worker-failure-api-version/`: intentional failure fixture for worker handshake API-version mismatch.
- `backend-worker-failure-missing-method/`: intentional failure fixture for worker handshake required-method mismatch.
- `backend-worker-failure-transport/`: intentional failure fixture for worker transport/process-exit errors.
- `backend-worker-failure-timeout-startup/`: intentional failure fixture for backend startup timeout.
- `backend-worker-failure-timeout-register/`: intentional failure fixture for backend register timeout.
- `frontend/`: frontend-only plugin with prebuilt ESM/CSS and section/pane/command registration.
- `frontend-topnav/`: frontend-only plugin focused on top-nav action registration.
- `frontend-errors/`: frontend fixture that intentionally registers invalid runtime payloads.
- `content/`: content-only plugin with blueprint/template/prompt payloads.
- `full/`: full plugin (backend + frontend + content + config schema).
- `metadata-mismatch-id/`: install-time failure fixture for package-name vs manifest-id mismatch.
- `metadata-mismatch-version/`: install-time failure fixture for package-version vs manifest-version mismatch.
- `metadata-mismatch-layout/`: install-time failure fixture for ambiguous plugin root archives (multiple manifests).
- `scope-shadowing/`: frontend fixture intended for scope precedence/shadowing tests.

Target fixture catalog (coverage baseline):

- Maintain at least 15 fixture plugins under `tests/fixtures/plugins/`.
- Include fixtures for each category:
- backend success paths (router/static/MCP/LSP/external-agent/codegen)
- frontend success paths (sections/panes/commands/top-nav)
- full-stack success paths
- content-only paths
- deterministic validation/runtime failures (manifest, metadata mismatch, worker handshake/timeouts, frontend registration errors)
- precedence/scope scenarios (`workspace`, `environment`, `global`, shadowing)

Current count:

- 21 fixture directories are currently present under `tests/fixtures/plugins/`.
- 20 are standalone plugin roots (`setta.plugin.json` at fixture root).
- 1 (`metadata-mismatch-layout`) is an intentional multi-root archive fixture.

Each fixture should include:

- valid `setta.plugin.json`
- minimal implementation required to exercise its feature
- a short `README.md` describing purpose, capabilities, and expected behavior

Each fixture is intentionally minimal but valid for `setta plugins validate` unless it is an explicit failure fixture used to test deterministic error paths.
