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

- Frontend: simple scaffolds can edit `frontend/dist/index.js` directly and export:
  - `apiVersion`
  - `register(host)`
  - optional CSS: `frontend/dist/index.css` and set `frontend.style` in manifest
- Frontend: source-built plugins may instead keep source/build inputs under
  `frontend/`, emit `frontend/dist/*`, and declare `frontend.build` in the
  manifest so Setta knows the bundle is plugin-owned.
- Backend: edit `backend/main.go` and `backend/go.mod`.
- Content: add templates/assets under `content/`.

Language-server-only package-manager plugins may use a thin `backend/main.py`
probe entrypoint when the package runtime already owns the actual server
executable. Keep that entrypoint probe-only: it should validate/emit language
server registrations, while Setta still owns selection, restart, status, and
transport behavior in Go.

App-subsystem backend providers that use a package-managed Python entrypoint
should keep that entrypoint as a thin dispatcher through
`setta.plugin_runtime.run_app_subsystem_backend(__file__)`. Do not copy
listener endpoint inventories or local-core dispatch logic into the plugin;
those contracts are published by the Setta package and generated from Go-owned
metadata.

### Manifest contract notes

- `capabilities` must use the runtime manifest vocabulary. In addition to the
  older frontend-facing entries, that includes
  `registerMcpTools`, `registerLanguageServer`,
  `registerExternalAgentAdapter`, `registerCodegenTarget`,
  `registerRouter`, `registerListenerEndpoint`, `registerStaticDir`,
  `registerAppSubsystemBackend`, `registerSettingRevealHandler`, and
  `mutateWatchCodeSettings`. Project-canvas controls must request
  `registerCanvasControl`.
- `frontend.build.packageManager` currently accepts `pnpm` and is the opt-in
  contract for plugin-owned frontend builds from `frontend/package.json`.
- App-subsystem providers should declare both the required backend/runtime
  capabilities and `featureCapabilities.appSubsystem` so Setta can expose the
  correct surface area.
- `registerAppSubsystemBackend` requires a backend probe that returns the
  app-subsystem backend contract version and listener endpoints. The
  `setta.plugin_runtime.run_app_subsystem_backend` helper emits that probe for
  Python shim entrypoints.
- Some accepted capabilities may still be blocked by host or mode policy. Use
  `setta plugins validate` and `setta plugins list --json` to confirm effective
  versus blocked capabilities for your target mode.

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

Plugin settings use `strategy="plugin_handler"` for reveal/highlight. Request
`registerSettingRevealHandler`, then register a reveal handler in frontend
`register(host)`. Pane-backed settings usually register a pane too, while
canvas-control settings can reveal through the handler alone.

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

### Optional: add a project canvas control

Frontend plugins that need a button in the React Flow project controls rail can
request `registerCanvasControl` and register an imperative renderer:

```js
export function register(host) {
  host.registerCanvasControl({
    id: "my-control",
    label: "My Control",
    description: "Open my project tool",
    placement: "project",
    order: 100,
    renderer: {
      mount(el, props) {
        const button = document.createElement("button");
        button.type = "button";
        button.ariaLabel = props.label;
        button.textContent = "M";
        el.append(button);
      },
      unmount(el) {
        el.textContent = "";
      },
    },
  });
}
```

Supported placements are `project`, `viewport`, and `utility`; controls sort by
placement, `order`, label, plugin ID, and control ID. Use
`readProjectState`/`subscribeProjectState` when the control reflects project
state.

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

- manifest schema and capability vocabulary, including `frontend.build` and
  `featureCapabilities` when present
- app-subsystem backend probe shape when `registerAppSubsystemBackend` is
  declared
- file path safety and existence
- Go backend entrypoint shape and successful `go build` for Go backend plugins
  (`package main`, `func main()`)
- package-managed Python backend probe execution for Python shim entrypoints
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
