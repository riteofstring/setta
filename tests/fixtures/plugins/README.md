## Plugin Fixture Suite

Canonical first-party fixture plugins used by tests and docs.

Principles:

- Keep many fixture plugins with intentionally different capabilities and failure modes.
- Use these fixtures for unit, integration, Playwright, and manual smoke testing.
- Keep fixtures production-like: valid manifests, real entrypoints, and deterministic behavior.
- Fixture frontend `dist` assets are generated on demand via `scripts/plugin-fixtures/build.sh`.

Current fixtures:

- `backend/`: backend-only plugin shell with a minimal Python entrypoint.
- `backend-external-agent/`: backend-only plugin that registers external agent adapters.
- `frontend/`: frontend-only plugin with generated ESM/CSS and section/pane/command registration.
- `frontend-react/`: frontend-only plugin with a React-rendered plugin section kind.
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
- backend success paths (minimal backend shells, historical external-agent fixture)
- frontend success paths (sections/panes/commands/top-nav)
- full-stack success paths
- content-only paths
- deterministic validation/runtime failures (manifest, metadata mismatch, frontend registration errors)
- precedence/scope scenarios (`workspace`, `setta_files`, `global`, shadowing)

Current count:

- 22 fixture directories are currently present under `tests/fixtures/plugins/`.
- 15 are standalone plugin roots (`setta.plugin.json` at fixture root).
- 1 (`metadata-mismatch-layout`) is an intentional multi-root archive fixture.

Each fixture should include:

- valid `setta.plugin.json`
- minimal implementation required to exercise its feature
- a short `README.md` describing purpose, capabilities, and expected behavior

Each fixture is intentionally minimal but valid for `setta plugins validate` unless it is an explicit failure fixture used to test deterministic error paths.

Build fixture frontend assets:

```bash
scripts/plugin-fixtures/build.sh all
```
