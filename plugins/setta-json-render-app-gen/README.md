# Setta JSON Render App Generation Plugin

This first-party plugin gates the extracted app subsystem.

## Packaging Model

- `enabledByDefault` remains `false`.
- The package-manager wheel for this plugin ships discovery metadata only:
  `setta.plugin.json` and this README under
  `setta-json-render-app-gen/`.
- The host Setta distribution owns the compiled backend registrars, generated
  contracts, and lazy frontend chunk for the app subsystem.
- That split is intentional: the app frontend registers host-rendered React
  components, so it must stay in the host frontend build and share the host
  runtime instead of loading a separate bundled React copy from the plugin
  wheel.

Installing this package makes the app subsystem available to the plugin system,
but the feature still stays off until the plugin is enabled.

## Build And Install

Build the plugin wheel from this folder:

```bash
python -m build
```

Install it into the active environment:

```bash
uv pip install ./plugins/setta-json-render-app-gen
```
