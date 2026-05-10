# Plugin Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` defines `Plugin` as a real frontend section type.
  - `internal/projectstate/top_level_section_creation.go` defines Plugin defaults: `pluginId`, `kind`, `data`, and `schemaVersion`.
  - `internal/projectstate/top_level_section_creation_test.go` verifies creation payloads preserve `pluginId`, `kind`, and plugin-owned `data`.
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` routes `SectionTypeEnum.Plugin` to `PluginArea`.
  - `frontend/src/components/Section/Layouts/PluginArea.tsx` owns Plugin rendering: runtime error card, registered renderer host, loading card, unavailable fallback card, plugin data JSON copy, open Plugins action, and delete action in editable mode.
  - `frontend/src/components/Section/Layouts/PluginArea.test.tsx` verifies loading/error/fallback wording and actions.
  - `frontend/src/plugins/runtimeInternal.ts` defines registered plugin section kinds, renderer `mount/update/unmount`, section props, host capabilities, server mode, and `updateSection`.
  - `frontend/src/plugins/runtime.ts` exposes `usePluginSectionKind` lookup for `pluginId` plus `kind`.
  - `docs/guides/plugin-fixture-manual-smoke.md` documents the fixture React plugin section kind.
  - `tests/fixtures/plugins/frontend-react/frontend/src/index.tsx` provides a real registered plugin section renderer with fixture data, stats, tags, and plugin-owned controls.
- Data shown:
  - Plugin section impl fields: `pluginId`, `kind`, `schemaVersion`, and plugin-owned `data`.
  - Runtime host props: `sectionId`, `serverMode`, `readOnly`, and `effectiveCapabilities`.
  - Registered section kind metadata: title `React Fixture Card`, description, and renderer lifecycle support.
  - Fixture plugin-owned data: title, details, tags, pinned state, saved pulse count, and local click count.
- Controls/actions:
  - Standard section shell controls remain in the shared flat titlebar.
  - The mounted plugin renderer exposes its own controls: pin/unpin, save pulse through `updateSection`, and local-click state.
  - The PluginArea fallback path owns `Open Plugins`, `Copy Section JSON`, and editable-mode `Delete Section`; those are documented as important fallback actions but are not mixed into the normal mounted-renderer prototype.
- Important states:
  - Primary rendered state: runtime loaded and the `(pluginId, kind)` section kind is registered, so PluginArea mounts the plugin renderer into the body.
  - Loading state while runtime is `idle` or `loading`.
  - Runtime error state with pluginId/kind and Open Plugins action.
  - Unavailable fallback state when the runtime is loaded but the plugin or section kind cannot render.
  - Read-only user view disables destructive fallback actions and passes `readOnly` to plugin renderers.
- Interactions that must stay recognizable:
  - Plugin sections are plugin-owned bodies mounted by host lifecycle, not native Setta row/port/editor layouts.
  - The host passes runtime context and section data to the renderer.
  - Plugin-owned controls may update Plugin section data through host APIs or keep local renderer state.
  - Fallback actions let users inspect the plugin, copy section JSON, or remove an unavailable plugin section.

## Layout Invariants
- Conceptual regions and ordering:
  - External preview/gallery section-type label above the prototype.
  - Shared flat section shell/titlebar first.
  - Plugin-specific body is a host mount region that contains plugin-owned content.
  - The mounted renderer content is visually distinct from Setta-native rows, ports, workflow handles, terminals, editors, or browser lists.
- Relative placement of important controls:
  - Standard shell controls stay in the titlebar.
  - Runtime/plugin identity and capability context are secondary host metadata near the mounted renderer, not row controls.
  - Plugin-owned controls stay inside the mounted renderer region.
  - Fallback actions belong to the fallback card state and are not displayed in the normal mounted renderer state.
- Grouping/containment relationships:
  - Plugin host metadata is grouped as a compact runtime strip.
  - Plugin-owned renderer data, stats, controls, and tags are contained inside one mounted renderer surface.
  - The renderer surface is nested inside the Plugin body; the external gallery label remains outside the section shell.
- Scroll or overflow expectations:
  - Plugin sections are generic and can be compact or large. This prototype uses a moderate mounted-card height matching the inspected fixture renderer.
  - The body should not overflow; plugin-owned content should fit without clipped labels or controls.

## Intentional Differences
- What the flat prototype is allowed to change:
  - Uses the flat prototype shell, typography, borders, and deterministic static plugin fixture instead of loading a real plugin bundle.
  - Shows a compact host metadata strip so the generic Plugin host behavior is recognizable in a static prototype.
- What production layout logic is intentionally not reused:
  - Does not reuse `PluginArea` DOM, fallback card Tailwind chains, lifecycle hooks, Zustand selectors, dynamic `mount/update/unmount` execution, OpenAPI calls, clipboard handling, or plugin fixture CSS.
- Confirmation that the prototype is not fictional and is not an old-design lift:
  - The rendered content maps to real Plugin section fields, real runtime host props, real plugin section-kind registration, and the checked-in React fixture plugin section.
- Confirmation that every visible prototype affordance maps to real section behavior or data:
  - Plugin id, section kind, schema version, server mode, capabilities, read-only state, renderer lifecycle, fixture title/details/tags/stats, pin, save pulse, and local click all map to inspected PluginArea/runtime/fixture behavior.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component:
  - The `Plugin` label will be added only through `FlatPrototypeGalleryItem`, above the section shell.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed:
  - This task will add Plugin-only fixture data, rendering helpers, styles, tests, and gallery entries without altering Callable or Dict fixtures, body structure, row hierarchy, controls, ports, or accepted baseline styling.

## Component Plan
- New files or functions:
  - Add `plugin` to `FlatSectionKind` and the prototype icon mapping.
  - Add Plugin fixture types/data, `FlatPluginBody`, and `FlatPluginSectionPrototype` in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  - Add Plugin-specific CSS in `FlatSectionPrototype.css`.
  - Add dark/light gallery entries with the external `Plugin` label.
- Static fixture data:
  - Plugin section `plugin-react-fixture` for `setta-fixture-frontend-react` kind `fixture-react-card`, schema version `1`, server mode `ide`, capabilities `registerSectionKinds` and `updateSection`, and fixture data from the checked-in React Fixture Card.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` to include Plugin in gallery counts/labels and verify Plugin-specific markup, normal mounted-renderer state, absence of unrelated row/port/workflow/editor/browser/terminal affordances, and protected Callable/Dict isolation.
  - Add a CSS guard that Plugin stays host/renderer-oriented with contained body layout.
  - Run focused Vitest for `FlatSectionPrototype.test.tsx`, formatting checks, `git diff --check`, and CDP visual verification of `/internal/flat-section-prototype` when feasible.
