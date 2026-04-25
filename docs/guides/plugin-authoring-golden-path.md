# Plugin Authoring Golden Path

This guide is the canonical end-to-end path for building and publishing a Setta plugin.

## 1. Initialize a plugin scaffold

```bash
setta plugins init setta-my-plugin --template full --out .
```

This generates:

- `setta.plugin.json`
- `backend/` Go scaffolding when using `--template backend` or `--template full`
- `frontend/dist/` and `content/` scaffolding when using `--template full`
- `pyproject.toml` with package metadata aligned to manifest `id` and `version`

`setta plugins init` now generates a Go-backed `backend/main.go` scaffold for
backend-capable templates. Backend plugin support remains in scope, and new
backend authoring should target Go rather than Python.

## 2. Implement plugin logic

- Frontend: edit `frontend/dist/index.js` and export:
  - `apiVersion`
  - `register(host)`
  - optional CSS: `frontend/dist/index.css` and set `frontend.style` in manifest
- Backend: edit `backend/main.go` and `backend/go.mod`.
- Content: add templates/assets under `content/`.

Language-server-only package-manager plugins may use a thin `backend/main.py`
probe entrypoint when the package runtime already owns the actual server
executable. Keep that entrypoint probe-only: it should validate/emit language
server registrations, while Setta still owns selection, restart, status, and
transport behavior in Go.

### Optional: define plugin UI settings from config schema

Add `x-setta-ui-settings` entries to your plugin config schema (`content/config/schema.json`) when settings should read/write plugin config paths directly:

```json
{
  "type": "object",
  "properties": {
    "enabled": { "type": "boolean" }
  },
  "x-setta-ui-settings": [
    {
      "settingId": "enabled",
      "title": "Plugin Enabled",
      "description": "Enable plugin behavior.",
      "paneId": "my-settings-pane",
      "revealKey": "my-settings",
      "configPath": ["enabled"],
      "defaultValue": false,
      "mutability": "writable"
    }
  ]
}
```

Notes:
- `settingId` is plugin-local; MCP callers will see `plugin::<pluginId>::<settingId>`.
- `configPath` must be a non-empty string array.
- `defaultValue` is required and must validate against `valueSchema` (or inferred schema at `configPath`).

### Optional: implement frontend reveal handlers for plugin settings

Plugin settings use `strategy="plugin_handler"` for reveal/highlight. Register a pane and reveal handler in frontend `register(host)`:

```js
export function register(host) {
  host.registerPane({
    id: "my-settings-pane",
    title: "My Settings",
    renderer: {
      mount(el) {
        el.textContent = "Settings UI";
      },
      unmount(el) {
        el.textContent = "";
      },
    },
  });

  host.registerSettingRevealHandler(
    "my-settings",
    ({ settingId, durationMs, abortSignal }) => {
      if (abortSignal.aborted) {
        return false;
      }
      // Focus/scroll/highlight the DOM control for settingId.
      return true;
    },
  );
}
```

Notes:
- `revealKey` in schema/backend registration must match `registerSettingRevealHandler(revealKey, ...)`.
- Reveal handlers must return `true`/`false` (or `Promise<boolean>`).

## 3. Link locally during development

```bash
setta plugins link ./setta-my-plugin --scope workspace --force
setta plugins rescan
setta plugins list
setta plugins restart-required
```

## 4. Validate plugin contract

```bash
setta plugins validate ./setta-my-plugin
```

Validation checks:

- manifest schema and capability vocabulary
- file path safety and existence
- Go backend entrypoint shape for backend plugins (`package main`, `func main()`)
- successful `go build` of the backend entrypoint directory for backend plugins
- manifest/package metadata identity consistency when package metadata exists

## 5. Build distribution artifacts

```bash
cd setta-my-plugin
python -m build
```

## 6. Publish

Choose at least one source path:

1. GitHub repository release/tag
2. PyPI package publish

## 7. Install in Setta

```bash
setta plugins install github:owner/repo#v0.1.0
setta plugins install pypi:setta-my-plugin==0.1.0
```

Optional scopes:

- `--scope workspace`
- `--scope setta_files`
- `--scope global`

## 8. Verify runtime status

```bash
setta plugins list
setta plugins restart-required
```

Use fixture references in `tests/fixtures/plugins/` for known-good examples.
Backend-capable plugins should assume the live runtime is Go-owned and keep
their backend entrypoint in `backend/main.go` with dependencies in
`backend/go.mod`.
