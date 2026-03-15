# Plugins Pane Card Owners

- Date: `2026-03-15`
- Surface: `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`

## Before

- `PluginsPane.tsx` was about `2023` lines and still mixed runtime/install
  orchestration with per-plugin card render branches, schema-backed config
  editors, language-server settings editors, config-schema parsing, and shared
  button/capability/install-summary shells.
- CDP baseline on `http://127.0.0.1:3002/racing_busy` at `1400x900` showed the
  plugin runtime, install form, and discovery table without active plugin card
  content.

## After

- `PluginsPane.tsx` is now `607` lines.
- Ownership moved to:
  - `pluginsPanePluginCard.tsx` for per-plugin action/render branches,
    capability sections, and pane/command launch shells.
  - `pluginsPaneConfigEditors.tsx` for schema-backed plugin config editing and
    language-server settings editors.
  - `pluginsPaneConfigSchema.ts` for top-level config-schema field derivation
    and immutable config updates.
  - `pluginsPaneShared.tsx` for shared action-button, capability-row, and
    install-summary shells.
- CDP verification on the same route and viewport injected one linked-local
  plugin entry into `usePluginRuntimeStore` and confirmed:
  - `ACTIVE PLUGINS (1)` rendered.
  - the linked-local guidance banner rendered.
  - `Update` and `Rollback` stayed disabled.
  - the discovery-status table remained visible beside the extracted card path.

## Performance Note

- This was a behavior-preserving ownership refactor rather than a DOM-heavy UI
  redesign. The main performance win is narrower responsibility and per-plugin
  render ownership: the root pane no longer owns the plugin-card branches or
  config-editor state directly.
- I did not record timing assertions because the reproducible CDP scenario uses
  injected plugin runtime data rather than a stable large-catalog fixture.
