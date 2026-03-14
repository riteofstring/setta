# Frontend Module Map

This is the front door for authored frontend code under `frontend/src/`.

## Primary Ownership Map

| Area                               | Owns                                                                                | Start Here                                                                                   | Notes                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages and routing                  | route trees, mode wrappers, page-level loading and guards                           | `components/Pages/`                                                                          | Route assembly belongs here, not in pane or section modules.                                                                                     |
| App shell and chrome               | app registry, header, global wrappers, top-level modal containers                   | `components/App/`, `components/AppHeader/`, `components/Modals/`                             | Keep app-level composition separate from feature internals.                                                                                      |
| Overview panes and authoring panes | overview tabs, UI editor, project config/app config panes                           | `components/Panes/`                                                                          | New pane-specific helpers should usually live next to the owning pane.                                                                           |
| Chat and project AI                | shared chat UI, project-level AI panes, chat windowing                              | `components/Chat/`, `components/ChatWindowing/`, `components/Panes/Overview/ProjectLevelAI/` | This is the densest hotspot; prefer feature-local modules over shared helpers here.                                                              |
| Sections and params                | section shells, headers, layouts, param rendering, section-level controls           | `components/Section/`, `components/Params/`                                                  | Shared section infrastructure should stay policy-driven and modular.                                                                             |
| Shared UI infrastructure           | reusable layout primitives, floating boxes, resizable wrappers, context menu shells | `components/Utils/`                                                                          | Only truly cross-feature UI primitives belong here.                                                                                              |
| State commands and store wiring    | Zustand stores, command modules, subscriptions, view-model hooks                    | `state/`, especially `state/stores/`, `state/actions/`, and `state/hooks/`                   | Keep read helpers distinct from mutation commands.                                                                                               |
| Shared utilities                   | low-level pure helpers with cross-feature reuse                                     | `utils/`                                                                                     | `utils/` is not a fallback for feature code. Prefer feature-local helpers first. Split shared constants live under `utils/constants/` by domain. |
| Plugin runtime                     | plugin bootstrap/runtime integration and plugin pane icons                          | `plugins/`                                                                                   | Plugin contracts belong here, not inside generic app modules.                                                                                    |
| Generated boundaries               | generated routes/types and forked third-party code                                  | `utils/generated*`, `forks/`                                                                 | Do not hand-edit generated or forked code unless absolutely required.                                                                            |

## Where New Code Goes

- Put feature-specific helpers beside the owning feature before considering `utils/`.
- Put presentational subcomponents under the owning feature tree, not in `components/Utils/`, unless they are reused across multiple unrelated features.
- Put pure derived read-model logic in selectors/helpers that live with the owning feature or store domain.
- Put mutations behind named command functions in `state/actions/` or a feature-local command module. Avoid ad hoc `getState()` / `setState()` reach-through from UI files.
- Wrap generated endpoints/types in feature-local adapters when usage would otherwise leak into leaf UI components.
- Add tests beside the owning authored code:
  - Vitest unit/integration tests as `*.test.ts(x)` next to the module.
  - Performance guardrails as `*.perf.test.ts(x)` next to the module when the surface is render- or data-heavy.
  - Playwright coverage under `frontend/tests/e2e/` for interactive flows that materially change.

## State Ownership Rules

- `state/definitions.ts` is the current shared store entry point. New store work should move toward domain-owned store modules instead of extending one large mixed file.
- Persisted UI preferences now live in `state/stores/localStorageStore.ts`, and persisted AI/session chat state now lives in `state/stores/aiStore.ts`.
- Active selection, node internals, and atomic staged project-store publication now live in `state/stores/activeSectionStores.ts`.
- Validation and diagnostics stores now live in `state/stores/diagnosticsStores.ts`, and transient loading/connection/interaction UI state now lives in `state/stores/ephemeralUiStores.ts`.
- Shared file-browser store state now lives in `state/stores/fileBrowserStores.ts` for home, overview, browser-section, and dropzone pickers.
- Authoring workflow stores now live in `state/stores/authoringStores.ts`, runtime/run-log stores now live in `state/stores/runtimeStores.ts`, and global settings now live in `state/stores/settingsStore.ts`.
- Reads and writes should be easy to distinguish:
  - selectors/query helpers answer questions
  - command modules perform mutations
- If a component needs derived state in more than one place, extract a named selector instead of rebuilding the derivation inline.
- If a command mutates optimistic frontend state, keep the domain entry point explicit even if a shared helper exists underneath.

## Placement Rules

- `components/`
  - Owns render composition and feature-local UI helpers.
  - Should not parse transport payloads or own broad cross-domain mutations inline.
- `state/actions/`
  - Owns named mutation commands and state sync flows.
  - Prefer smaller domain files over adding more branches to mega-files.
- `state/hooks/`
  - Owns selector-style hooks, URL/view-model hooks, and component-facing read helpers.
- `state/types/`
  - Owns authored frontend state types that are not generated.
- `utils/`
  - Owns small, pure, cross-feature helpers and constants.
  - If a helper only makes sense inside one feature, keep it in that feature instead.
- `components/Utils/`
  - Owns reusable UI primitives and interaction shells.
  - Do not place feature-specific business rules here.

## File Size Guidance

- Preferred target for new or substantially refactored production files: under 500 lines.
- Review threshold: 800 lines.
- If a file stays above 800 lines, the owning feature should document why the boundary is still the clearest available shape.

## Allowed Patterns

- Store access:
  - Prefer hooks/selectors in render paths.
  - Prefer named commands for writes.
  - Avoid introducing fresh direct `useStore.getState()` / `useStore.setState()` calls in leaf components when a selector or command boundary can carry the behavior.
- Transport:
  - Prefer feature-local API wrappers around generated route functions.
- Tests:
  - Extract pure helpers first, then lock behavior with Vitest before moving JSX around.
  - Add Playwright coverage when a user-visible interaction flow changes materially.
- Imports:
  - Prefer explicit imports from owning modules over broad barrel files that hide ownership.

## Fast Navigation Tips

- Need a page or route change: open `components/Pages/`.
- Need pane/tab behavior: open `components/Panes/`.
- Need section chrome or param rendering: open `components/Section/` and `components/Params/`.
- Need a mutation path: search in `state/actions/`.
- Need shared derived state or a component-facing hook: search in `state/hooks/`.
- Need a pure cross-feature helper: check `utils/`.
