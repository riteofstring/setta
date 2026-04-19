# Setta JSON Render App Generation Plugin

This first-party plugin gates the extracted app subsystem.

## Packaging Model

- `enabledByDefault` remains `false`.
- The package-manager wheel now ships the normal runtime-managed plugin shape:
  `setta.plugin.json`, a backend entrypoint under `runtime_backend/`, and the
  bundled frontend entrypoint under `frontend/dist/`.
- The host still owns the current app-subsystem integration paths until the
  remaining generalization phases land, but the plugin package itself now
  exposes real runtime entrypoints instead of metadata only.

Installing this package makes the app subsystem available to the plugin system,
but the feature still stays off until the plugin is enabled.

## Build Frontend Bundle

Rebuild the packaged frontend bundle from the shared repo frontend toolchain:

```bash
pnpm -C frontend exec vite build --config ../plugins/setta-json-render-app-gen/frontend/vite.config.mjs
```

## Build Wheel

Build the plugin wheel from this folder:

```bash
python -m build
```

## Install

Install it into the active environment:

```bash
uv pip install ./plugins/setta-json-render-app-gen
```
