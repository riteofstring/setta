# Setta JSON Render App Generation Plugin

This first-party plugin gates the extracted app subsystem.

## Packaging Model

- `enabledByDefault` remains `false`.
- The package-manager wheel now ships the normal runtime-managed plugin shape:
  `setta.plugin.json`, a backend entrypoint under `runtime_backend/`, and the
  bundled frontend entrypoint under `frontend/dist/`.
- The plugin frontend now owns its build metadata under `frontend/` with
  explicit third-party dependencies and a vendored packaged copy of
  `@setta/app-subsystem-frontend-sdk` for staged-source builds.
- The plugin now declares its plugin-owned frontend build contract in
  `setta.plugin.json`, so source/deployment packaging no longer depends on a
  host-side plugin-id special case.
- The plugin still depends on Setta runtime contracts for app-subsystem
  integration, which is intentional.

Installing this package makes the app subsystem available to the plugin system,
but the feature still stays off until the plugin is enabled.

## Build Frontend Bundle

Build the frontend bundle through the plugin-owned frontend package metadata:

```bash
pnpm --dir plugins/setta-json-render-app-gen/frontend install --lockfile=false
pnpm --dir plugins/setta-json-render-app-gen/frontend build
```

The repo wrapper remains optional and now just delegates to the plugin-owned
build:

```bash
pnpm -C frontend exec node ./scripts/buildAppSubsystemPluginFrontend.mjs
```

## Build Wheel

Build the plugin wheel from this folder:

```bash
python -m build
```

The wheel and editable build paths now rebuild `frontend/dist/*` from the
plugin-owned frontend package before packaging, and the source distribution
includes the frontend source/build inputs needed to do the same when building a
wheel from `sdist`.

## Install

Install it into the active environment:

```bash
uv pip install ./plugins/setta-json-render-app-gen
```
