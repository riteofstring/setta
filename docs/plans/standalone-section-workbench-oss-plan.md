# Standalone Section Workbench Plan

## Decision

Create one independently buildable and locally installable TypeScript/React package, `@setta/workspace`, and one backend-free playground that proves the package works in an unrelated application.

The package has one concrete purpose:

> Add a pannable, zoomable workbench to a React application where users can freely arrange or recursively nest arbitrary sections, sort nested sections vertically or horizontally, and reorder or nest host-defined items inside those sections.

This plan covers only that reusable workbench. It does not commit to Python Canvas, MCP Canvas, Agent Canvas, Data Canvas, Agent Signal Canvas, or any other domain-specific application. A future application may use the package, but no future application shapes the initial package contract.

The package is a developer-facing reusable library. Whether it is later published, made open source, or moved to another repository is a separate decision outside this plan. The playground is a polished, runnable demonstration and consumer fixture, not a second product or required backend.

### Naming

Use the broad package name `@setta/workspace` while retaining **section** as the public name for a content-bearing workbench region.

- Public contracts use names such as `WorkspaceSection`, `SectionDefinition`, `sectionId`, and `focusSection`.
- Do not expose **node** as the primary package concept. In this product, a section owns content, frame chrome, sizing, and an optional ordered child layout; calling it a node would imply graph, edge, port, or execution semantics that are outside the initial scope.
- XYFlow nodes are an internal rendering-adapter detail. They must not leak into `WorkspaceDocument`, section render props, commands, callbacks, or consumer persistence.
- Reserve **node** for XYFlow integration code and any future explicit graph surface. Reserve **item** for the host-defined sortable tree inside a section.
- The package name does not need to encode every object it contains. The README and package description should identify it as a nested spatial workbench for React so the shorter name remains discoverable.

The component and helper names may receive normal API cleanup before the initial package milestone, but the document model should not alternate between parallel `section` and `node` terminology.

## Product thesis

The useful unit is not merely an infinite canvas. Pan, zoom, and draggable cards are widely available.

The differentiated interaction is two levels of direct manipulation:

1. **Macro structure:** arrange and resize top-level sections spatially; recursively nest sections to arbitrary depth; move sections through both sibling-sorting and cross-container free-move interactions; and lock or minimize sections when the layout needs to stabilize.
2. **Micro structure:** reorder and optionally nest host-defined fields, controls, parameters, or other items inside a section while the workbench is transformed.

The package should make both levels feel like one coherent interaction system:

- Inner controls remain interactive.
- Section dragging does not steal item dragging.
- A ready-made but extensible toolbar, searchable creation menu, minimap, marquee selection, and predictable stacking make the blank workbench usable without every consumer rebuilding basic canvas UX.
- Sorting mode reorders a nested section among its current siblings along the parent section's layout axis.
- Free-move mode can take a section from any source depth to the top-level canvas or any valid destination section at any depth.
- Multi-selection and batch movement preserve selection roots, relative order, and top-level spatial offsets without moving a selected descendant twice.
- Nested sections preserve a stable drop target near parent, child, and insertion boundaries instead of flickering as the pointer crosses them.
- Every nested section container can lay out its direct children vertically or horizontally without changing their hierarchy or order.
- Containers can either grow with their children or retain a fixed size and scroll internally.
- Item dragging remains correct at every supported zoom level.
- Drop indicators and overlays match the transformed geometry.
- Pointer, touch, and keyboard interactions produce the same resulting structure.
- The consuming application decides what sections and items mean.

A compelling first example is a blank workbench containing:

- A simple note section.
- A simple counter or status section.
- A container section demonstrating several levels of vertical and horizontal section nesting.
- A field-list section whose rows can be reordered and nested.
- A small palette for adding those sections.
- A built-in viewport toolbar plus a host-injected example action.
- Controls demonstrating locking, minimizing, content-fit and fixed sizing, container overflow, snap-to-grid, grid customization, per-section accents, compact chrome, and light/dark appearance.
- Searchable right-click creation, marquee selection, grouping, ungrouping, batch actions, and a minimap.
- JSON import/export and local persistence implemented by the example.

## Package shape and deferred distribution

Build one package with subpath exports rather than multiple packages:

```text
@setta/workspace
@setta/workspace/core
@setta/workspace/react
@setta/workspace/testing
```

The package may use internal modules for canvas, drag-and-drop, item trees, history, and testing. Those modules do not become separate packages unless they later become independently useful.

Publishing and hosting are explicitly deferred. This plan does not require or authorize:

- Publishing to npm or another package registry.
- Creating, moving to, or making public a GitHub repository.
- Registry credentials, `publishConfig`, release automation, changelog automation, registry-oriented versioning, or a public support policy.
- A decision about the final license or public contribution model beyond satisfying third-party obligations during development.

Keep package manifests private during this work. Local workspace installation and a locally packed tarball are allowed only to verify that an unrelated consumer can use declared exports and dependencies; they are not publication steps. Any registry, repository, license, or public-release work requires a later explicit decision and a separate plan update.

Implementation occurs in this repository and this working directory on a dedicated blank-slate branch. The branch starts from an explicitly recorded `main` commit, but its first implementation change intentionally replaces the application working tree with only the new package, playground, consumer fixture, documentation, and selected development tooling. Blank slate describes branch contents, not a requirement for orphaned Git history. Do not create another worktree.

The branch must still:

- Have its own package manifest, build, tests, and example.
- Build without Setta frontend aliases.
- Import nothing from `frontend/src/state`, generated Setta types, OpenAPI clients, or application components.
- Be installable into a consumer fixture that is outside the package source tree.

Retain or adapt only the development-tooling baseline needed by this TypeScript/React project:

- An exact Node version in `.node-version`, an exact pnpm `packageManager` declaration, exact-pinned pnpm workspace metadata and lockfile behavior, and private root and package manifests while distribution remains undecided.
- A minimal `.gitattributes`, `.gitignore`, and `.editorconfig` for line endings, generated output, dependencies, test artifacts, local environment files, and editor consistency. Recreate these for the new tree rather than copying application-specific ignore rules.
- A rewritten `AGENTS.md` scoped to this TypeScript library, documenting ownership boundaries, the no-compatibility stance, exact dependency pins, required quality and audit commands, package-boundary rules, accessibility, visual verification, and performance expectations.
- Prettier formatting and import organization.
- ESLint for TypeScript and React, including the current fail-at-10 cyclomatic-complexity guard for production and test code.
- Strict TypeScript type-checking, including unused-symbol and unchecked-index protections.
- Knip dead-code, unused-export, unused-file, and dependency checks through a direct project-specific configuration rather than Setta's generated-code cleanup loop.
- File-length enforcement using the current initial limits of 1,000 lines for production TypeScript and 1,200 lines for tests, plus non-failing hotspot reports for complexity and file length.
- Vitest, a backend-free Playwright harness that starts the playground directly, automated accessibility assertions, representative visual baselines, focused performance scenarios, package build, local pack, and consumer-fixture commands. Automated accessibility scanning supplements rather than replaces keyboard completion, focus, accessible-name, role, state, announcement, zoom, and reduced-motion assertions.
- Package-contract checks for declared exports, generated declarations, the CSS entrypoint, tree shaking, local tarball contents, an unrelated consumer build, and accidental imports of source files or internal modules. Generate a reviewable public-API report from declarations; before the initial milestone, changes are allowed but must be intentional.
- Supply-chain checks for exact direct pins, manifest/lockfile consistency, frozen installs, declared package contents, dependency licenses, and explicitly approved dependency lifecycle scripts.
- pnpm's `minimumReleaseAge` configured to 10,080 minutes, or seven days, for every external direct and transitive dependency, with `minimumReleaseAgeStrict: true` and `minimumReleaseAgeIgnoreMissingTime: false` so the resolver never silently falls back to a younger version or accepts missing publication metadata.
- Registry-backed verification of the complete loaded lockfile with `trustLockfile: false`, so a lockfile produced outside the normal resolution path cannot bypass the age policy. A `minimumReleaseAgeExclude` exception must name one exact package and version with a rationale, owner, and expiry; do not use permanent package-name or package-family exclusions.
- pnpm dependency-trust checks with `trustPolicy: no-downgrade` and `blockExoticSubdeps: true`. Any `trustPolicyExclude` entry or direct Git/tarball dependency requires one exact package and version or immutable source, a rationale, owner, and expiry.
- A network-backed vulnerability-audit command covering runtime and development dependencies. High or critical findings fail; every lower-severity finding is reported and must be explicitly triaged rather than silently ignored. Suppressions require a narrow advisory ID, rationale, owner, and expiry.
- A machine-readable dependency inventory generated from the lockfile for audit evidence. Artifact signing, registry provenance, and publication attestations remain deferred with distribution.
- One fast quality entrypoint that checks changed files by default and supports explicit staged, file-list, and full-project modes.

Preserve the behavior and thresholds of the useful current tooling, but rewrite its path discovery for the blank branch. Do not carry `activate.sh`, Python or Go quality dependencies, Setta generation and cleanup steps, application-specific Knip fix loops, OpenAPI tooling, plugin tooling, installer/runtime scripts, deployment scripts, release scripts, worktree helpers, current GitHub workflows, Git hooks, application-wide ignore files, or backend-coupled browser runners merely because the current wrappers reference them. Reimplement the useful policy from `audit_supply_chain.sh` with pnpm-native settings and small Node-owned checks instead of carrying its Python/Go orchestration. Do not copy either fork wholesale. The retained tooling must run from a clean checkout of the blank branch with only Node and the exact-pinned package-manager/toolchain prerequisites documented by that branch. Keep deterministic, offline-capable checks in the normal quality path; expose registry-backed lockfile-age and trust verification plus vulnerability auditing as separate required commands so a network outage cannot masquerade as a code-quality failure.

### Greenfield implementation stance

Treat this package as a clean implementation, not a refactor of the current Setta frontend.

- Perform the work on the dedicated blank-slate branch in this working directory. Before the branch-content replacement, require a clean worktree, record the source commit, and verify the new branch name; switching back to `main` restores the current application tree.
- Do not copy the existing repository tree and prune it gradually. Start from the minimal package/playground/fixture structure and intentionally bring over only the selected tooling policies and isolated behavior references.
- Assume most current UI implementation code will be discarded. Preserve behavior only when it is intentionally selected through characterization, product review, and the new package boundary.
- Use the current Setta UI as behavioral evidence and a source of isolated pure algorithms, not as the component tree, state model, public API, or dependency graph to carry forward.
- Do not confuse discarding the current component and state architecture with discarding its interaction kernel. The existing section DnD code contains required zoom coordination, collision hysteresis, nested-target resolution, multi-selection geometry, preview, and move-planning behavior that upstream libraries do not provide. Preserve those outcomes and port naturally package-owned pure algorithms where that is clearer and safer than recreating them from memory.
- Before removing the current application files from the working tree, prepare a compact evidence manifest naming the recorded source commit, relevant files and symbols, retained behavior scenarios, executable fixture or characterization-test destinations, and third-party license obligations. Include it in the blank-slate replacement commit. Git history remains the source archive; the new branch retains only the manifest, generic test vectors, intentionally ported pure algorithms, and their tests.
- Do not add backward compatibility, legacy support, data migrations, transitional adapters, old-field aliases, dual read/write paths, compatibility fallbacks, or feature-flagged old/new implementations.
- Do not preserve current Setta project-file compatibility, frontend imports, state shapes, generated types, CSS conventions, or XYFlow store contracts.
- If a current behavior is valuable, specify it in the new package's tests and implement it against the new model. Similar-looking code is reusable only when it is already pure, smaller than a clean implementation, correctly licensed, and naturally fits the new ownership boundary.
- The future Setta application should be rewritten to consume the package's public API directly. Any new domain mapping must be designed as a permanent owner boundary, not as a bridge for the old frontend.
- Before the initial package milestone, breaking package changes are acceptable when they simplify the API or remove inherited assumptions.

The goal is behavioral continuity only where the plan explicitly requires it. Source continuity is not a goal.

## Initial package scope

### Workbench canvas

The package owns:

- A container-filling spatial canvas for top-level sections.
- Pan and zoom with configurable minimum, maximum, and initial zoom.
- Configurable pan-on-drag, pan-on-scroll, pan-on-scroll speed and axis mode, wheel zoom, pinch zoom, double-click zoom, and temporary pan/zoom activation keys.
- Explicit no-pan and no-wheel boundaries so scrollable or interactive host content does not fight the viewport.
- An optional background grid with configurable spacing, pattern, mark size, and appearance-aware color.
- Snap-to-grid for top-level movement and section resizing, independently toggleable from grid visibility.
- Scoped light, dark, and system appearance support through package-owned semantic theme tokens.
- Viewport read and update helpers.
- `focusSection`, `fitSection`, and `fitSections` helpers, plus deterministic next/previous section navigation.
- Pointer and keyboard selection, modifier-key multi-selection, and marquee selection with configurable partial- or full-containment semantics.
- A pannable, clickable, toggleable minimap with configurable left or right placement.
- A ready-made viewport toolbar containing zoom in, zoom out, reset zoom, fit, snap, and minimap controls.
- Typed toolbar-control and canvas-overlay extension points for host-defined actions without replacing package controls.
- Section movement at arbitrary supported zoom levels.
- Recursive section containment with no package-imposed maximum depth.
- Vertical and horizontal ordered layouts for the direct children of a nested section container.
- Sorting mode for reordering a nested section among its current siblings.
- Free-move mode for moving a section from any source depth to the top-level canvas or any valid nested destination depth.
- Orientation-aware insertion previews, collision resolution, and keyboard movement.
- Stable, zoom-aware drop targeting across adjacent siblings and parent-child boundaries.
- Section resizing at any depth with kind-defined axes and minimum and maximum dimensions.
- Per-section position-and-size locking.
- Per-section minimizing with exact restoration for fixed dimensions and restoration of content-fit mode for content dimensions.
- Single and batch section deletion and lock changes.
- Section creation through a public action used by the example palette and context menu.
- Deterministic smart placement that prefers visible non-overlapping workbench space when creation does not specify a position.
- Searchable right-click creation at the pointer's workbench position.
- A generic external-drop callback that receives browser transfer data, workbench coordinates, and the candidate destination without assigning domain meaning to the drop.
- Empty-container drop affordances.
- Predictable top-level stacking: the active or dragged section's top-level ancestor renders above its peers without rewriting persistent order merely because selection changed.
- Stable section IDs.
- Controlled and uncontrolled React usage.
- Host-controlled edit capabilities for layout, structure, and package-owned presentation, with a `readOnly` convenience mode.
- Structural undo and redo for committed section changes.
- A minimal, versioned, serializable workbench document.

Top-level sections use free spatial positions. Nested children use their immediate parent's ordered vertical or horizontal layout. The initial scope does not add absolute positioning inside nested containers.

The two section drag modes are interaction modes, not two serialized layout models:

- **Sorting mode** keeps the current parent and changes only sibling order. It is available for nested sections; top-level sections remain spatial rather than sortable.
- **Free-move mode** may change parent and depth. A drop on the canvas produces a top-level position; a drop inside a section produces an orientation-aware child insertion index. It must support canvas-to-nested, nested-to-canvas, and nested-to-nested moves regardless of source or destination depth.

The initial package milestone supports dragging one section or a selected sibling block. Batch movement operates on normalized selection roots: when a selected section contains another selected section, only the ancestor participates. A dragged block must share one source parent in the initial scope. Top-level blocks preserve spatial offsets; nested blocks preserve logical sibling order. Mixed-parent batch dragging is rejected specifically rather than producing an ambiguous partial move.

### Workbench modes, controls, and extension surfaces

Backend or host authorization remains authoritative, but the workbench must also prevent locally disallowed interactions. A backend rejection is not a substitute for disabling an unavailable gesture before it starts.

The React API should remain close to:

```ts
type WorkspaceCapabilities = {
  editLayout: boolean;
  editStructure: boolean;
  editPresentation: boolean;
};

type WorkspaceGestureOptions = {
  minZoom: number;
  maxZoom: number;
  initialZoom: number;
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  panOnScrollSpeed: number;
  panOnScrollMode: "free" | "horizontal" | "vertical";
  zoomOnScroll: boolean;
  zoomOnPinch: boolean;
  zoomOnDoubleClick: boolean;
};

type WorkspaceToolbarControl = {
  id: string;
  placement: "project" | "viewport" | "utility";
  label: string;
  icon: React.ReactNode;
  onPress(): void;
  pressed?: boolean;
  disabled?: boolean;
};
```

Required behavior:

- `readOnly` is a convenience for disabling layout, structure, and package-owned presentation edits; it is not a security boundary.
- `editLayout: false` prevents movement, reordering, reparenting, resizing, orientation changes, stacking commands, and direct lock changes while preserving navigation and host-content interaction.
- `editStructure: false` prevents creation, deletion, grouping, ungrouping, and other membership changes.
- `editPresentation: false` prevents title, minimize, chrome, accent, and tag changes while leaving transient selection, pan, zoom, focus, and fit behavior available.
- The package cannot make arbitrary host-rendered content read-only. It passes the resolved workbench read-only state to the renderer so the host can enforce its own content policy.
- Capability state is host/session policy and is not serialized into `WorkspaceDocument`.
- Package controls and host controls share consistent focus, tooltip, pressed, disabled, and coarse-pointer behavior.
- Host controls use typed descriptors for the common button case; documented overlay slots remain available for richer panels.
- Toolbar and overlay extensions receive the public controller rather than importing package state.
- All gesture options are scoped to one workbench instance and may change without remounting it.
- Scroll and pan suppression markers work inside arbitrary host renderers without requiring Setta CSS classes.
- The public controller exposes creation, selection, grouping, lock, focus, fit, viewport, and persistent stacking commands. It does not expose internal stores.

### Section registry and frame

A consuming application registers its own section kinds.

The package owns:

- The section frame.
- A drag handle.
- Recursive rendering of child section containers.
- The ordered child-section region and its vertical or horizontal layout.
- Selection, focus, disabled, and resizing presentation.
- A package-owned title, optional icon slot, and inline title editor with validation, cancel, commit, and error presentation.
- Default, compact, transparent, and headerless chrome variants with an accessible drag/selection affordance even when the normal header is absent.
- Optional per-section accent and tag-color presentation using scoped semantic tokens rather than arbitrary package-global CSS.
- A content boundary that does not impose a domain layout.
- Error containment for a failing section renderer.
- Default-size metadata.
- Default size-mode, chrome, accent, and title metadata.
- Default child-orientation metadata for section kinds that accept children.
- Searchable creation metadata such as label, group, keywords, and icon.
- A public action for changing a section's child orientation without changing its child order.
- Hooks or callbacks for host-provided section actions.

The host owns:

- Section meaning.
- Section payloads.
- Section-specific rendering.
- Domain validation.
- Whether a section kind may contain child sections.
- Whether a proposed section parent-child relationship is valid.
- Section-specific menus and commands.
- Optional asynchronous title validation or persistence rejection beyond package-owned format checks.
- Any network, file, execution, or persistence behavior.

The initial API should remain close to:

```ts
type SectionDefinition<TData> = {
  kind: string;
  displayName: string;
  defaultTitle?: string;
  defaultSize: {
    width: number;
    height: number;
  };
  defaultSizeMode?: {
    width: "fixed" | "content";
    height: "fixed" | "content";
  };
  contentSizing?: {
    width: boolean;
    height: boolean;
  };
  resize?: {
    axes: "both" | "horizontal" | "vertical" | "none";
    minSize?: Partial<{ width: number; height: number }>;
    maxSize?: Partial<{ width: number; height: number }>;
    preserveAspectRatio?: boolean;
  };
  minimizable?: boolean;
  canContainSections?: boolean;
  defaultChildOrientation?: "vertical" | "horizontal";
  defaultChildOverflow?: "grow" | "scroll";
  chrome?: "default" | "compact" | "transparent" | "none";
  creation?: {
    group?: string;
    keywords?: string[];
    icon?: React.ReactNode;
  };
  render: React.ComponentType<SectionRenderProps<TData>>;
};

type SectionRenderProps<TData> = {
  sectionId: string;
  data: TData;
  appearance: "light" | "dark";
  readOnly: boolean;
  updateData(nextData: TData): void;
};
```

The exact names may change during implementation, but the boundary must remain host-rendered and backend-neutral. Theme variables inherit into the host renderer, and the resolved light or dark appearance is also passed explicitly so consumers can theme custom content without reading package-internal state. Proposed defaults are resize on both axes, content sizing permitted on both axes but fixed initially, minimizable, default chrome, not a section container, and vertical child orientation with growing overflow when containment is enabled.

Title behavior is package-owned because the frame renders it. A controlled consumer may validate or persist a proposed title asynchronously, but the editor owns keyboard behavior, Escape cancellation, focus restoration, pending state, and specific rejection presentation. A title change is one committed document change. The searchable creation UI is generated from registry metadata; consumers may hide kinds or provide additional creation items without replacing its keyboard and filtering behavior.

Chrome variants change presentation, not structural semantics. A headerless or transparent section remains selectable, keyboard reachable, draggable when unlocked, and capable of exposing its actions through selected-state chrome or an accessible floating handle. Accent and tag colors never become the only indication of selection, lock, error, or drop validity.

The package-owned frame renders the recursive child-section region adjacent to host-rendered content. A host may style documented slots, but it cannot replace the ordered container or its drag geometry with unrelated markup. This keeps collision detection, accessibility, and orientation behavior consistent at every depth.

Changing orientation preserves the same logical child order. Vertical layout follows the block axis. Horizontal layout follows the logical inline axis, so leading and trailing behavior remains correct in right-to-left documents as well as left-to-right documents.

### Section locking, minimizing, and resizing

Locking and minimizing are generic section-frame capabilities, not host-domain behavior.

Position-and-size locking has a deliberately narrow meaning:

- A locked section cannot be moved on the canvas, reordered, reparented, or resized by pointer, touch, or keyboard.
- Locking does not disable the section's host-rendered controls or freeze its data.
- Locking is not inherited by descendants.
- A locked container may still accept or rearrange unlocked child sections unless host policy separately rejects that structural change.
- Ancestor layout changes may still move a locked nested section visually; the lock prevents direct edits to that section's own placement and size.
- Lock state has an icon, accessible label, and persistent non-color indicator. Color alone must not communicate the state.

Minimizing has similarly explicit behavior:

- A minimized section renders compact frame chrome and omits its host-rendered body.
- Its serialized expanded size modes and fallback values are retained. Fixed dimensions restore exactly; content dimensions resume fitting and remeasure when expanded.
- Its nested child-section region remains visible and structurally usable; minimizing the complete subtree is a different capability.
- A minimized section remains selectable, movable when unlocked, and available as a valid container.
- The host renderer is unmounted while minimized, so durable host state belongs in the section payload rather than component-local state.
- The minimize control exposes expanded/collapsed state semantically and restores focus predictably.
- A section kind with `minimizable: false` exposes no minimize control and rejects a minimize command specifically.

Resizing requirements:

- Resize handles operate on logical inline-end, block-end, and the adjoining corner so they mirror correctly in right-to-left layouts.
- Section definitions may constrain resize axes, minimum size, maximum size, and aspect-ratio preservation.
- Resizing works for top-level and nested sections at every supported zoom level.
- A nested resize reflows only the affected container branch and preserves sibling hierarchy and order.
- With snapping enabled, committed sizes resolve to the configured workbench-unit grid while still respecting minimum, maximum, and aspect-ratio constraints.
- Pointer movement uses transient size state; one completed resize creates one document change and one history entry.
- Locked or minimized sections expose no active resize handles.
- Keyboard resizing uses documented increments and the same constraints and snapping behavior as pointer resizing.

Content sizing and container overflow are separate, explicit capabilities:

- Width and height each have a `fixed` or `content` size mode.
- A fixed dimension uses its serialized numeric value. A content dimension follows measured package chrome, host content, and participating child layout while respecting the section definition's minimum and maximum constraints.
- Starting a manual resize on a content-sized dimension captures the measured dimension and switches that axis to fixed sizing before applying pointer movement.
- Double-clicking or invoking the keyboard command on a resize handle returns the affected axis to content sizing when the section definition permits it.
- A container in `grow` overflow mode allows its child region to participate in content measurement.
- A container in `scroll` overflow mode retains a bounded section size and scrolls its child region internally. Wheel interaction inside that region does not pan or zoom the outer canvas while scrolling remains possible.
- Switching from grow to scroll captures stable measured dimensions for any axis that must become fixed, preventing a visual jump.
- Switching from scroll to grow restores content participation without changing containment, orientation, or child order.
- Content measurement uses `ResizeObserver` or an equivalent bounded observer strategy, avoids measure-update loops, and never writes canonical document state on every subpixel fluctuation.
- Fixed dimensions restore exactly after minimization. Content-sized dimensions resume content fitting and remeasure after expansion using their stored finite fallback values until measurement completes.
- Size mode and container overflow changes are explicit, undoable commands and create one history entry each.

### Grid, snapping, and appearance

Grid visibility, spatial snapping, and visual appearance are independent host-level preferences. They are not serialized into `WorkspaceDocument` by default.

The public options should remain close to:

```ts
type WorkspaceAppearance = "light" | "dark" | "system";

type WorkspaceGridOptions = {
  visible: boolean;
  snap: boolean;
  spacing: [x: number, y: number];
  pattern?: "dots" | "lines" | "cross";
  markSize?: number;
};

type WorkspaceThemeTokens = {
  canvasBackground: string;
  gridColor: string;
  sectionBackground: string;
  sectionText: string;
  sectionMutedText: string;
  toolbarBackground: string;
  minimapBackground: string;
  selection: string;
  focus: string;
  invalid: string;
};

type WorkspaceAppearanceOptions = {
  appearance: WorkspaceAppearance;
  light?: Partial<WorkspaceThemeTokens>;
  dark?: Partial<WorkspaceThemeTokens>;
};
```

Required behavior:

- Grid visibility does not implicitly enable snapping, and snapping works when the visual grid is hidden.
- Grid spacing is expressed in workbench units. Its screen rendering and snap calculations remain aligned at every zoom and pan offset, including negative canvas coordinates.
- Top-level section movement and manual section resizing snap to the grid. Nested sibling placement remains ordered by its parent rather than spatially snapped.
- The grid pattern and grid color can be customized independently of the canvas background.
- Grid color is a decorative semantic token and is not reused for focus, selection, valid-drop, or invalid-drop meaning.
- Light and dark themes have separate semantic token values; dark appearance is not a mechanical inversion of light appearance.
- New default palette values use consistently formatted OKLCH, stay in the supported browser gamut, and are checked in both appearances. Consumer overrides may use any documented valid CSS color.
- Default foreground/background pairs target APCA `|Lc| >= 75` for body text and `|Lc| >= 60` for non-body text, with WCAG 2 AA checks reported as a compatibility reference. Focus and component boundaries maintain at least `3:1` contrast against adjacent colors.
- The package scopes theme variables to the workbench root and never mutates the consuming application's `<html>` element or global color-mode classes.
- The workbench root declares the resolved CSS `color-scheme` so package-owned native controls match the selected appearance.
- `system` follows `prefers-color-scheme`; an explicit `light` or `dark` choice wins over system preference.
- Changing appearance updates package chrome, grid, drag previews, focus, selection, and invalid states without changing the document, viewport, selection, or host-rendered data.
- A section accent derives a documented local set of chrome, text, muted-text, focus, and selected-state tokens with contrast checked in both light and dark appearances. A tag color is a smaller categorical marker and does not recolor the complete frame.
- Accent and tag colors are optional serializable section presentation, while the global palette and color-picker choices are host preferences.
- Accent colors have one decorative/category role and are never reused as link, success, warning, invalid, selection, or focus colors merely because the value matches.
- The default color editor offers reset and a small accessible palette; consumers may replace the palette without replacing package contrast and non-color state indicators.
- Hosts can persist grid, snapping, and appearance preferences separately. The playground demonstrates that persistence without making a storage mechanism part of the package.

### Selection, stacking, grouping, and navigation

Selection is a package-owned interaction model rather than a host reconstruction from click callbacks.

Required behavior:

- Clicking selects one section; the documented modifier toggles membership without discarding the existing selection.
- Marquee selection may use partial intersection or full containment according to a workbench option and works at every supported zoom and pan offset.
- Marquee selection considers visible section frames at every depth. When both an ancestor and descendant are selected, structural and movement commands operate on normalized selection roots.
- The selection outline and hit area encompass the selected roots, support pointer movement as a unit, and support keyboard movement using the same grid and lock rules.
- A ready-made selection context menu exposes the valid group, ungroup, lock/unlock, delete, and persistent stacking actions for the current normalized roots; unavailable mixed-parent actions explain why they are disabled.
- A selected sibling block preserves source order. A selected top-level block preserves relative workbench offsets.
- Locked selections reject batch movement specifically. Batch lock and unlock update only sections whose state must change.
- Delete removes every selected root subtree once. Undo restores the complete set and selection predictably.
- Group creates one new container at the selected siblings' shared parent, moves the selected roots into it in their existing order, and selects the new group.
- The host registers a group factory that supplies the new container kind, ID, title, and initial payload. The package owns placement and containment but never invents domain payload data; Group is unavailable with a specific explanation when no valid factory is registered.
- Top-level grouping places the group at the selected bounds and translates child placement into the group's ordered layout without losing canonical section identity.
- The initial scope requires one shared parent for grouping. Mixed-parent grouping is disabled with a specific explanation rather than guessing a least-common-ancestor transformation.
- Ungroup promotes a group's direct children into the group's parent at the group's index, preserving order. At the top level it resolves non-overlapping workbench positions from the group's measured bounds before deleting the empty group frame.
- The active or dragged section's top-level ancestor receives a transient render lift above the persistent root stacking order. Selection alone does not create a document change or history entry.
- Public `bringToFront`, `sendToBack`, `bringForward`, and `sendBackward` commands map the selection to distinct top-level ancestors, change persistent root order explicitly, and are undoable.
- `focusSection` selects and pans a section into view without unnecessarily changing zoom. `fitSection` and `fitSections` adjust zoom to show the requested measured bounds within documented padding.
- Next and previous navigation traverse roots by workbench `y`, then `x`, persistent stack order, and stable ID, with descendants following their canonical sibling order; navigation does not depend on mount timing.
- A hierarchical outline navigator is a planned optional React component after the initial milestone. The controller and traversal helpers required to build it are part of the initial package API.

### Smart creation and external drops

Creation without an explicit position uses a pure TypeScript placement helper owned by the standalone package:

- It receives the current root rectangles, viewport bounds, new section default or measured size, padding, and optional grid.
- It first searches visible non-overlapping workbench space, then deterministic space adjacent to existing roots.
- It returns workbench coordinates and an optional pan target without mutating the document.
- Explicit pointer or host-provided positions always win over smart placement.
- Creation selects and transiently raises the new section, then restores focus according to the creation source.
- The searchable context menu uses the pointer's workbench coordinates and registry metadata. Keyboard invocation uses the last meaningful canvas location or viewport center.
- The placement result is submitted through the same controlled document path as any other creation. A backend may validate or persist it, but the package does not require a backend to recompute it.

External drop is an extension boundary, not a built-in file importer:

- The package recognizes a browser drag entering the canvas, resolves workbench coordinates and a candidate parent, and exposes valid/invalid feedback.
- On drop it calls the host with `DataTransfer`, workbench position, candidate parent and insertion index, and the originating browser event metadata required to distinguish files or application-defined MIME data.
- The host decides whether to create a section, reject the drop, or perform asynchronous import work.
- Native file type detection, upload, filesystem access, and file-to-section mapping remain host responsibilities.
- External drop never silently becomes section DnD or item-tree DnD, and scrollable content can opt out of receiving it.

### Recursive section movement

Section movement needs a pure planning boundary comparable to the item-tree boundary. The planner receives canonical containment, measured geometry, zoom, active drag mode, and host policy; it returns one deterministic proposed move without mutating the document.

The public or testable shape should remain close to:

```ts
type SectionMovePlan = {
  sectionIds: string[];
  mode: "sort" | "free";
  sourceParentId: string | null;
  destinationParentId: string | null;
  destinationIndex: number;
  topLevelPositions: Record<string, { x: number; y: number }> | null;
};

type SectionMoveDecision =
  | { allowed: true }
  | { allowed: false; reason: string };
```

The workbench accepts an optional host callback that evaluates a `SectionMovePlan` against the current document and returns a `SectionMoveDecision`. Structural checks such as cycle prevention remain package-owned; the callback is for host-specific relationships. Its rejection reason is available to visual and assistive feedback.

Required behavior:

- `sectionIds` contains one section or normalized selection roots with one shared source parent. Nested blocks follow canonical sibling order; top-level blocks use deterministic `y`, `x`, persistent stack order, and stable-ID order.
- Sorting mode changes only `destinationIndex` under the existing parent and moves a selected block atomically.
- Free-move mode accepts any valid source and destination depth, including an empty destination container.
- A free move to the canvas resolves one or more positions in workbench coordinates, not screen coordinates, and preserves a top-level block's relative offsets.
- A free move into an ordered container inserts the selected block in source order at one destination index.
- Moving between coordinate spaces preserves the section's visible position until the destination layout takes over.
- Moving any selected root into itself or one of its descendants is rejected before preview and commit.
- Mixed-parent batch moves are rejected before a drag starts in the initial scope.
- Host policy can reject a destination without changing canonical state.
- The previewed parent and index exactly match the committed move.
- Reparenting changes one canonical child list relationship; a parent lookup index is derived rather than serialized as a second source of truth.

Target resolution must preserve the useful stability of Setta's current section DnD rather than replacing it with naive pointer intersection:

- Collision candidates are ranked consistently while overlap is ambiguous.
- The previous valid target remains favored within a documented tolerance.
- Crossing a sibling midpoint changes the proposed insertion only after the orientation-aware threshold is crossed.
- Entering or leaving a nested parent uses separate trigger-distance behavior so the preview does not oscillate between a parent, its child, and a neighboring insertion slot.
- Thresholds are evaluated in the correct coordinate space and scale with workbench zoom.
- Leaving all valid targets clears stale parent and insertion state.
- Invalid, self, and descendant targets remain visibly distinct from valid targets, and attempting to drag a locked active section produces specific feedback without entering a drag.

The existing Setta implementation is the required behavioral baseline for this interaction kernel, including its cached over-target and previous-rectangle state, midpoint tracking, child-over-parent collision promotion, trigger-distance conditions, orientation-specific sorting, selection-shaped drag geometry, layout-stable preview transforms, and XYFlow zoom scaling. Phase 0 must characterize those behaviors with focused tests before porting or reimplementing them against the new model. Exact constants are implementation details to validate through those tests and interaction profiling, not values to copy into the public API.

### Sortable item trees inside sections

The reusable public concept is a sortable item tree, not a Python parameter model.

Potential host meanings include:

- Form fields.
- Function arguments.
- Tool inputs.
- Configuration rows.
- Inspector properties.
- Dashboard controls.
- Workflow-node inputs.
- Arbitrary nested list items.

The package owns:

- Flat item reordering.
- Nested item reordering.
- Moving one item or a selected sibling block into or out of a parent item.
- Modifier-key item selection, normalized selection roots, and multi-item drag overlays and placeholders.
- Cycle prevention.
- Insertion-index planning.
- Drag placeholders and overlays.
- Zoom-aware geometry.
- Scoped collision detection.
- Explicit drag handles.
- Keyboard reorder, indent, and outdent interactions.
- Focus restoration after a move.
- Host rejection of an invalid move.
- A pure helper for applying an accepted move to a generic item tree.

The host owns:

- Item values and schemas.
- Item renderers.
- Whether an item may contain children.
- Whether a proposed parent-child relationship is valid.
- Applying and persisting accepted moves.
- Domain names such as `parameter`, `pinned`, `required`, or `callable`.
- Domain behavior caused by a move.

The public shape should remain close to:

```ts
type SortableItemTree = {
  rootId: string;
  itemIds: string[];
  childrenByParent: Record<string, string[]>;
};

type ItemMovePlan = {
  itemIds: string[];
  sourceParentId: string;
  destinationParentId: string;
  destinationIndex: number;
};

type SortableItemTreeProps = {
  tree: SortableItemTree;
  selectedItemIds: string[];
  onSelectedItemIdsChange(ids: string[]): void;
  renderItem: (itemId: string) => React.ReactNode;
  canContainChildren?: (itemId: string) => boolean;
  canMove?: (plan: ItemMovePlan) => boolean;
  onMove: (plan: ItemMovePlan) => void;
};
```

Required item-tree invariants:

- `rootId` is a non-rendered root and is not included in `itemIds`.
- Item IDs are unique and non-empty.
- Every item appears exactly once as a child of the root or another item.
- Every parent key is the root or a known item.
- Every child is a known item.
- The tree is acyclic and every item is reachable from the root.
- A destination index is resolved against the destination's children after removing every moving item in the selected sibling block.
- Move plans contain normalized selected roots in stable source order.
- Multi-item dragging initially requires one shared source parent. A mixed-parent selection remains selectable for host actions, but starting a batch drag falls back to the active item with specific feedback.
- Dragging an unselected item selects only that item. Dragging a selected item moves the normalized selected sibling block.
- Keyboard move, indent, and outdent operate on the same selection roots and commit atomically.

The first implementation supports one item tree per section and one dragged item or selected sibling block. Multiple named lists, filtered-list reconciliation, mixed-parent batch dragging, and cross-section item moves are deferred.

### Interaction arbitration

Outer section dragging and inner item dragging must be designed together.

Requirements:

- A section or selected sibling block moves only from a selected section drag handle or the documented selection handle.
- An item or selected sibling block moves only from an item drag handle.
- Sorting mode and free-move mode are mutually exclusive and have visibly different active-state and drop-preview treatment.
- The package exposes an accessible way to select the active section drag mode; the host may also bind documented shortcuts.
- Sorting mode cannot silently turn into a cross-parent move.
- Free-move mode may traverse nested droppable regions without nested event providers stealing or canceling the active drag.
- Inputs, buttons, text selection, and nested interactive content do not initiate either drag.
- Drag scopes distinguish `section` and `item` collisions.
- Starting an item drag cannot select or move the containing section unexpectedly.
- Starting a marquee, batch section drag, or multi-item drag cannot leak selection changes into another scope.
- Panning cannot begin from an active section or item drag handle.
- Canceling either drag restores the prior structure and focus.
- A drag commits one structural change at drag end rather than writing every pointer movement to canonical state.
- Transient overlays and placeholders are not serialized.

A single workbench-level interaction coordinator is preferred. Nested providers are acceptable only if tests prove that pointer, touch, keyboard, cancellation, and transformed geometry remain correct.

## Public workbench document

Keep the first document focused and backend-neutral despite the richer workbench UI:

```ts
type SectionOrientation = "vertical" | "horizontal";
type SectionChrome = "default" | "compact" | "transparent" | "none";
type SectionDimension = {
  mode: "fixed" | "content";
  value: number;
};

type WorkspaceDocument<TSectionData = unknown> = {
  schemaVersion: 1;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  rootSections: Array<{
    sectionId: string;
    position: {
      x: number;
      y: number;
    };
  }>;
  sections: Record<
    string,
    {
      id: string;
      kind: string;
      title: string;
      positionAndSizeLocked: boolean;
      isMinimized: boolean;
      size: {
        width: SectionDimension;
        height: SectionDimension;
      };
      presentation: {
        chrome: SectionChrome;
        accentColor: string | null;
        tagColor: string | null;
      };
      data: TSectionData;
      childLayout: {
        orientation: SectionOrientation;
        overflow: "grow" | "scroll";
        sectionIds: string[];
      } | null;
    }
  >;
};
```

Required invariants:

- `schemaVersion` is explicit.
- Section IDs are unique, stable, and non-empty.
- Every root and child entry references a known section exactly once.
- Every section appears exactly once, either in `rootSections` or in one section's `childLayout.sectionIds`.
- Containment is acyclic, and every section is reachable from `rootSections`.
- A section may have descendants to arbitrary depth; validation does not impose a numeric depth limit.
- The order of `rootSections` defines top-level stacking order, and each nested `sectionIds` array defines sibling layout order.
- Only root entries have free spatial positions. Nested placement comes from the immediate parent's ordered layout.
- Root positions and all dimension fallback values are finite numbers.
- Dimension fallback values are positive, and every size mode is supported by the registered section definition.
- A content dimension's numeric value is a stable fallback and last fixed measurement, not a promise to serialize every live `ResizeObserver` result.
- Lock and minimized states are explicit booleans rather than inferred from presentation.
- A minimized section retains the same serialized expanded size modes and values.
- Titles are non-empty after package normalization and remain independent of host payload shape.
- Chrome, accent, and tag presentation are explicit package-owned fields; valid CSS colors are parsed specifically rather than silently ignored.
- A non-null `childLayout` has a supported orientation and overflow mode even when it has no children.
- Scroll overflow has a bounded measured region and cannot resolve to an unbounded content-sized main axis at runtime.
- Registered section containment policy accepts every persisted parent-child relationship.
- The viewport zoom is finite and within documented bounds.
- Unknown section kinds produce a clear render error or a host-provided unknown-kind renderer.
- Parsing and validation fail specifically; malformed documents do not silently fall back to an empty workbench.

Containment has one serialized source of truth: `rootSections` plus each section's ordered child list. The runtime may derive and incrementally maintain a parent lookup map, but it must not serialize a parallel `parentId` map that can drift from those lists.

Do not reserve speculative fields for edges, variants, references, revisions, approvals, or future applications. Add fields only when an implemented generic capability owns them.

The package does not define a complete application project format. A consuming application may embed `WorkspaceDocument` in its own document.

## State and change model

### Controlled and uncontrolled usage

The React surface supports:

- Controlled use through `document` and `onDocumentChange`.
- Uncontrolled use through `defaultDocument`.
- An in-memory host used by the playground and tests.

Controlled and uncontrolled props must be mutually exclusive and validated clearly.

### Internal commands

Use a small internal command reducer so UI gestures, keyboard actions, and tests exercise the same production behavior.

Initial internal commands are limited to:

- Create a section at the root or in a valid parent, using explicit or smart placement.
- Rename a section.
- Set section chrome, accent, or tag presentation.
- Delete one or more normalized section subtrees.
- Group selected siblings and ungroup a container.
- Apply an accepted section sort or free-move plan.
- Resize a section or switch an axis between fixed and content sizing.
- Set a container's grow or scroll overflow mode.
- Set one or more sections' position-and-size lock.
- Set a section's minimized state.
- Set a section's child orientation.
- Change persistent root stacking order explicitly.
- Select sections.
- Set viewport.

Deleting a section removes its complete descendant subtree as one explicit, undoable structural command. Batch deletion normalizes selected roots first. The package must not silently promote descendants or leave unreachable records. Group and ungroup use the same containment invariants and never serialize a temporary duplicate parent relationship.

These commands are implementation details in the initial scope. Do not expose the broad revision-checked operation, transaction, dry-run, inverse-operation, approval-summary, or MCP-ready schema from the earlier plan.

The public change callback may include a compact reason such as `section-move` or `section-resize` for diagnostics, but it must not be presented as a stable serialized automation protocol.

### History

Built-in history covers committed changes to `WorkspaceDocument`:

- One pointer drag creates one history entry.
- One section or sibling-block reparent, sibling reorder, resize, size-mode change, overflow-mode change, lock change, minimize change, orientation change, title change, presentation change, grouping, ungrouping, persistent stacking command, or batch subtree deletion restores exactly on undo and redo.
- Transient pointer movement does not create history entries.
- Viewport movement is not undoable by default.
- Selection changes are not undoable by default.
- Transient active-section stacking is not undoable or serialized; explicit stacking commands are.
- Live content measurements are transient. Switching size modes captures at most one committed measurement and history entry.
- Grid visibility, snapping, and appearance changes are host preferences and are not part of document history.
- Undo and redo restore document structure deterministically.

Item-tree data remains host-owned. The package provides multi-item-aware `applyItemMove` and move-planning helpers, but the host decides whether item moves participate in the host's history. The playground should demonstrate one coherent history that includes its item moves without making that integration a universal package contract.

## Persistence boundary

The package owns no persistence location.

It does not directly use:

- Local storage.
- IndexedDB.
- Files.
- A database.
- HTTP.
- WebSockets.
- A Setta backend.

The playground owns:

- Local persistence.
- Separate persistence for its grid visibility, snapping, and appearance preferences.
- Reset-to-example behavior.
- JSON import.
- JSON export.
- A visible schema-version error.
- Recovery from invalid user-provided JSON without losing the last valid in-memory document.

The consumer controls when changes are persisted and how failures are presented.

## TypeScript ownership decision

The standalone and offline requirements are the concrete platform reason for TypeScript ownership.

The standalone package is authoritative for its public workbench behavior and contracts even when it delegates lower-level canvas mechanics to an upstream dependency. Dependency state and types are not public state.

The package owns:

- Its own `WorkspaceDocument`.
- Its public viewport configuration, controller behavior, coordinate-space contract, and host-content pan/wheel suppression semantics.
- Grid visibility, appearance, and spacing semantics plus movement and resize snap policy.
- The ready-made minimap and navigation contract, projected from root sections by default because roots are the spatial workspace objects.
- Smart section placement from document geometry and viewport bounds.
- Section selection, marquee geometry, selection-root normalization, grouping, ungrouping, batch commands, and transient stacking behavior.
- One transient measured-geometry index covering every visible section frame at every depth. Marquee selection, selection bounds, focus and fit, collision planning, external-drop coordinates, and optional nested minimap summaries consume this index rather than maintaining parallel DOM-measurement paths.
- Recursive section containment and parent-index derivation.
- Section sort and free-move planning.
- Orientation-aware collision, insertion, and target-stability behavior.
- Fixed/content section sizing and grow/scroll container behavior.
- Generic single- and multi-item selection and move planning.
- Its internal history behavior.
- Its scoped appearance and semantic theme-token contract.
- Package chrome, inline title editing, ready-made controls, and host extension contracts.
- Its React contracts.

Upstream XYFlow may implement internal viewport transforms and coordinate conversion, background rendering, root-node hit testing and movement, root resize primitives, root minimap projection, and other canvas substrate behavior behind the package adapter. Using those implementations does not make XYFlow's node array, store, change events, or component props part of the `@setta/workspace` API. Workbench-specific semantics such as all-depth geometry, resize snapping, normalized selection roots, structural commands, ordered nested layouts, nested resizing, and cross-depth move plans remain package-owned even when they consume XYFlow geometry.

This is a deliberate new ownership boundary, not a handwritten mirror of the current Setta project model.

During implementation:

- Do not copy generated Setta types into the package.
- Do not define package types by manually restating a Go-owned Setta contract.
- Do not maintain old and new implementations of the same behavior behind flags or dual paths.
- Reuse a pure frontend algorithm only when the package becomes its clear new owner and the code naturally fits the new model.
- If current Setta later consumes the package, rewrite that integration against the package's public API and remove the superseded implementation.
- Current Setta compatibility is explicitly not a requirement.
- Existing Setta project files receive no migration or compatibility path as part of this work.
- Do not introduce transitional code merely to reduce the size of the rewrite diff.

## Rendering and dependency strategy

### Upstream XYFlow foundation

Use upstream `@xyflow/react` through a narrow internal adapter. Pin the exact current version when implementation starts; do not copy the current Setta XYFlow fork into the package and do not expose upstream types as package contracts.

The 2026-08-07 audit inspected upstream `xyflow/xyflow` main at commit `ee40209955e2e3b3d738397d281a147a73154fbd` and the published `@xyflow/react` `12.11.2`. That release already provides much of the undifferentiated canvas substrate:

- Configurable pan and zoom gestures, zoom bounds, viewport helpers, coordinate conversion, middle-button panning over nodes, auto-pan, and no-pan/no-wheel interaction boundaries.
- Dots, lines, and cross backgrounds with configurable gaps, sizes, and colors; movement snapping; and light, dark, or system color mode.
- Click, modifier, keyboard, and partial- or full-containment marquee selection; multi-node movement; recursive suppression of a selected descendant when its selected ancestor moves; and optional visible-element rendering.
- Parent-relative nodes through `parentId`, containment extents, parent expansion, recursive subflows with no explicit depth cap, selection elevation, and configurable automatic or manual z-index behavior.
- Extensible controls, panels, node toolbars, viewport portals, a clickable/pannable/zoomable minimap, and zoom-aware resize controls with axis, minimum, maximum, and aspect-ratio constraints.
- Viewport gesture start/change/end callbacks and queued fit behavior that waits for registered nodes to be measured.
- Recent performance work that avoids drag instances for non-draggable nodes, gives minimap nodes narrow subscriptions, and applies viewport transforms directly without rerendering the viewport component.

Those primitives do not replace the product described here. XYFlow parent-child nodes remain spatially positioned relative to a parent rather than automatically participating in an ordered vertical or horizontal child layout. Upstream does not provide Setta's sorting/free-move distinction, arbitrary cross-depth reparenting UI, target hysteresis, grow-versus-scroll containers, section document and registry, section frame behavior, grouping commands, structural history, smart creation, or generic sortable item trees.

The current Setta runtime establishes the most credible initial representation. Its XYFlow node renderer mounts only top-level spatial sections, while nested sections render recursively as ordinary ordered DOM and use dnd-kit for structure. Its marquee logic first uses measured XYFlow root nodes and then falls back to measured DOM frames for every remaining visible nested section. This is a meaningful workbench behavior, not functionality that the latest upstream XYFlow supplies automatically.

Begin Phase 0 with this architecture:

- Project each root section into one XYFlow node.
- Render descendants as package-owned recursive DOM inside their parent frame so CSS layout, grow/scroll behavior, and dnd-kit ordering remain natural.
- Register every visible root and descendant frame in one package-owned measured-geometry index expressed in workbench coordinates.
- Treat an all-sections-as-XYFlow-nodes projection or shadow-node hybrid as challenger designs only. Adopt one only if the proof shows a material advantage while preserving ordered layout, nested scrolling, all-depth selection, resize semantics, accessibility, and single-owner dragging without duplicated geometry or movement.

Only root sections have independent spatial positions, so the initial minimap projects roots by default. A future nested summary may consume the package geometry index, but must not present ordered descendants as independently positioned canvas roots.

The adapter must preserve these boundaries:

- `WorkspaceDocument` is the only canonical persisted model. XYFlow nodes are a derived render projection.
- Consumers import no XYFlow store, node, edge, change-event, or component-prop types through the public API.
- Prefer documented components, props, controller helpers, viewport hooks, measurement hooks, portals, and lifecycle callbacks. A documented public `useStoreApi` access is permitted only when a focused Phase 0 proof demonstrates that higher-level public APIs cannot meet a required high-frequency or imperative seam. Keep that access inside the adapter, cover the exact fields with exact-version contract tests, and never expose the store or its state shape.
- Do not import non-public source paths, copy internal modules, or make undocumented XYFlow store fields part of the implementation contract.
- Upstream marquee selection operates only on registered XYFlow nodes. The package owns all-depth marquee geometry, transient selection state, normalized selection roots, and the combined selection outline and hit area. Upstream selection behavior may be reused for projected roots only when it produces the same package outcomes.
- XYFlow position and resize change events update only an internal transient render projection during a gesture. They must not call `onDocumentChange`, create history, or become canonical section commands per frame. Pointer, touch, keyboard, and cancellation paths commit at most one accepted package command at the documented boundary.
- Exactly one subsystem owns movement at a time. XYFlow owns ordinary root spatial dragging; dnd-kit owns section sorting and free-move structure. Entering either structural mode disables XYFlow root dragging and conflicting viewport gestures, while leaving structural mode disables dnd-kit section activation. The selected-block overlay exposes the correct movement surface for the active mode.
- Root sections may use upstream resize primitives when they satisfy package constraints. Nested resize handles, content/fixed size promotion, grow/scroll participation, package snapping, and one-command commit behavior remain package-owned unless the chosen representation proves otherwise.
- Generic graph edges and ports stay disabled or absent in the initial scope even though the dependency supports them.

Phase 0 must prove the adapter against the difficult seams before broad UI implementation:

1. Render top-level spatial sections and arbitrarily deep ordered descendants while supporting grow and internally scrolling containers.
2. Maintain one correct incremental geometry index for visible roots and descendants through pan, zoom, recursive reflow, content measurement, grow/scroll changes, minimization, and drag previews.
3. Select visible sections at every depth, normalize selected ancestors and descendants, marquee across the package geometry index, and render a package-owned combined selection overlay without double movement.
4. Hand a root drag between XYFlow spatial movement and dnd-kit structural movement without duplicate deltas, accidental viewport motion, stale activation, or different pointer, touch, keyboard, and cancellation outcomes.
5. Preview and commit sorting and free-move plans across top-level and nested coordinate spaces at representative zoom levels.
6. Resize top-level and nested sections while preserving content sizing, scroll isolation, constraints, package-owned snap semantics, and one-command completion.
7. Lift the active or dragged top-level ancestor transiently without turning ordinary selection into a persistent document reorder.
8. Keep XYFlow node changes, marquee updates, live measurements, and resize changes transient; emit at most one accepted document change and, for an undoable command, one history entry at the package command boundary.
9. Wait for the relevant root-node and package-geometry measurements before initial fit, `focusSection`, `fitSection`, or `fitSections`, and prevent focusing interactive content from creating browser scroll offsets that diverge from the canvas viewport.
10. Keep unrelated section bodies, the root minimap, and the viewport from rerendering during high-frequency interaction.

If a required result cannot be expressed through public upstream APIs, prefer, in order: redesigning the adapter without changing the public behavior, contributing a general extension seam upstream, or maintaining a minimal exact-version patch with direct tests. A maintained fork is permitted only after those options fail; it must document every delta and its removal condition.

The current Setta fork remains a behavioral reference, not a source baseline. It contains 67 files and about 11,900 TypeScript, TSX, and CSS lines. Since its original import it has accumulated 136 follow-up commits, changed 59 fork files with about 9,400 insertions and 1,000 deletions, and become directly referenced outside the fork by 54 runtime files and 20 test files. That scale includes three different categories and must not be interpreted as evidence that the package needs a broad XYFlow fork.

Replace with current upstream substrate where the Phase 0 proof confirms the public surface:

- The vendored pan/zoom core, viewport conversion, root movement, background, controls, panel, portal, root minimap, registered-node selection, and root resize machinery.
- Local fixes whose outcomes latest upstream now provides, including middle-button node panning, gesture lifecycle callbacks, queued fit after registered-node measurement, direct viewport-transform DOM updates, and narrow minimap subscriptions.

Reimplement as package-owned workbench behavior:

- The root-node plus recursive-DOM representation, one all-depth geometry index, nested marquee coverage, package selection overlay, and focus/fit bounds for non-node descendants.
- The interaction-owner handoff among XYFlow root movement, dnd-kit sorting/free-move, the selected-block structural handle, and viewport gestures.
- Transient projection and commit coalescing, top-level ancestor lift, nested resize semantics, and the user-visible focus/scroll outcome currently protected by the scroll-sentinel behavior.

Rewrite or discard application coupling:

- Direct Setta Zustand stores, settings, generated types, backend selection publication, side-pane offsets, project loading, AI-follow suppression, file-opening drop behavior, notifications, and application-specific focus management.
- Agentic, argument, chat, and state-machine edge and handle systems. They are domain application features and remain outside the initial workbench scope even though a later Setta product may layer them over the package.

### Upstream dnd-kit foundation and package-owned interaction kernel

Use the current stable upstream dnd-kit packages through a narrow internal adapter and pin every direct package exactly when implementation starts. Do not copy or fork upstream drag infrastructure by default. Upstream is the substrate for sensors, modifiers, measurement, registration, overlays, accessibility, auto-scroll, and drag lifecycle; it is not the owner of workbench movement semantics.

The 2026-08-07 audit inspected `clauderic/dnd-kit` main at commit `6fb57833026e06bb3925eef78316ba56d59749c8` and the stable `0.5.0` package generation. Setta currently pins the earlier `0.2.1` generation. Current upstream adds a stronger plugin, sensor, modifier, feedback, collision, and sortable foundation, but it still models one active source and one resolved target. It does not provide:

- Multi-section or multi-item drag semantics and a combined selection collision rectangle.
- Persistent-target hysteresis, previous-target rectangle retention, directional entry and exit buffers, or child-over-parent promotion.
- Arbitrary cross-depth movement through mixed vertical and horizontal ordered containers.
- Coordinate correction for an arbitrary CSS-scaled ancestor such as the XYFlow viewport.
- A pure preview-and-commit planner that preserves selected-block order and top-level relative offsets.
- Setta's transform-based sortable preview behavior. The upstream optimistic sorting behavior may reorder the DOM and must not be adopted until it proves that constrained and nested scroll containers remain stable.

Upstream's recursive tree examples are useful implementation evidence, not a reusable mixed-orientation tree contract. They flatten and project one active item; they do not replace the recursive section or sortable-item APIs in this plan.

Setta's history demonstrates the intended boundary. The original vendored dnd-kit import at `97a20a75a` contained 176 files and about 8,400 added lines. The January 2026 migration at `74e01b02f` removed about 7,100 lines of forked core while deliberately retaining the custom collision, zoom, preview, nested-target, and multi-selection layer. Later fixes at `52b580e3a`, `e23229915`, and `a4340b944` specifically added oscillation control, resolved-target hysteresis, and atomic multi-section movement. That retained layer is not merely legacy compatibility; it contains the package's differentiated interaction behavior.

Treat the current implementation in three categories.

Port or reimplement as a package-owned, framework-neutral behavior kernel:

- Collision scoring and comparison from `frontend/src/forks/dnd-kit/adapter/collision.ts` and `collisionCompare.ts`, including previous-target preference, previous-rectangle retention, sortable priority, trigger-distance ordering, and child-over-parent promotion.
- Orientation-aware insertion and transform math from `adapter/sorting.ts`, `sortingOverState.ts`, and related pure geometry helpers.
- Selection bounds and active-operation-shape behavior from `dragRectBounds.ts` and `DragOperationShapeSync.tsx`.
- Atomic single- and selected-block planning from `useMoveSectionPlans.ts`.
- Generic item-tree planning, selection normalization, and drag-overlay measurement currently spread across `paramDndMonitorUtils.ts` and `paramTree.ts`.

Re-evaluate against the selected exact-pinned stable upstream release (`0.5.0` at audit time) and retain only when the Phase 0 proof shows that upstream behavior is insufficient:

- Provider, event-mapping, sensor, draggable, droppable, monitor, rectangle, and compatibility wrappers under `frontend/src/forks/dnd-kit/adapter`.
- The custom sortable context and hooks. Their old-API emulation should disappear, but their layout-stable transform preview may remain package-owned if upstream optimistic sorting still causes nested-scroll jumps or target feedback loops.
- Overlay and feedback plumbing that newer upstream packages can express without leaking upstream contracts publicly.

Rewrite rather than port application coupling:

- `useDropType.ts` contains important target-memory and preview-state-machine behavior, but it also imports Setta state, generated section types, notifications, and application policies. Specify and extract the generic state-machine outcomes; do not carry the hook or its Setta branches wholesale.
- `useMoveSection.ts` mixes useful coordinate outcomes with backend mutation and XYFlow selection updates. The pure plan belongs in the package; persistence and application-store updates do not.
- `dndState.ts`, parameter stores, generated-type checks, terminal/code-section rules, OpenAPI calls, and Setta notifications remain outside the package. Host policy handles domain-specific move rejection.
- `ParamDndMonitor.tsx`, `ParamDndList.tsx`, `ParamSwitch.tsx`, `SectionContainer.tsx`, and `ManyNestedSections.tsx` remain behavioral references rather than source baselines.

XYFlow-scale handling must become an internal coordinate service supplied to the DnD adapter rather than a direct import from the canvas store. It must provide the effective viewport scale and deterministic screen/workspace conversion needed by transforms, collision thresholds, overlays, placeholders, and canvas drops. Do not assume upstream dnd-kit handles this scaled-ancestor case: Phase 0 must prove pointer deltas, active and selection rectangles, drop targets, and overlays at minimum, default, and maximum zoom, both with and without nested scrolling.

The resulting implementation is therefore an upstream dependency plus a package-owned interaction kernel, not a dnd-kit fork and not a thin configuration of upstream defaults. Preserve behavior through deterministic tests before deleting any current source that is the only executable specification of that behavior.

Additional behavioral references include:

- `frontend/src/components/Section/Header/LockPositionButton.tsx`
- `frontend/src/components/Section/Header/MinimizeButton.tsx`
- `frontend/src/components/Section/Header/SectionTitle.tsx`
- `frontend/src/components/Section/Container/ContainerCore.tsx`
- `frontend/src/components/Section/Container/ContainerWrappers.tsx`
- `frontend/src/components/Section/Container/TopLevelContainer.tsx`
- `frontend/src/components/Section/Container/ManyNestedSections.tsx`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
- `frontend/src/forks/xyflow/background/Background.tsx`
- `frontend/src/forks/xyflow/controls/Controls.tsx`
- `frontend/src/forks/xyflow/core/components/NodesSelection.tsx`
- `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
- `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/Pane.tsx`
- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/forks/xyflow/core/utils/graph.ts`
- `frontend/src/forks/xyflow/minimap/MiniMap.tsx`
- `frontend/src/state/actions/sections/sectionPositions.ts`
- `internal/projectstate/top_level_section_creation.go`
- `frontend/src/components/Pages/GlobalWrapper.tsx`

These establish the existing interaction baseline for the root-node/recursive-DOM split, all-depth measured selection, movement-owner handoff, focus/scroll coordination, locks, minimized bodies, fixed/content and constrained resizing, container overflow, title editing, smart placement, selection and external drop, viewport gestures, toolbar extension, minimap navigation, stacking, grid alignment and appearance-specific colors, and system color-mode resolution. They remain application-coupled references rather than files to copy directly. The Go smart-placement implementation is evidence for behavior, not a contract to mirror mechanically; the standalone TypeScript package owns its backend-free placement helper under the explicit offline platform boundary described above.

### Styling

The package must not require the consuming application to use Tailwind or Setta's global CSS.

Use:

- Package-owned CSS.
- Workbench-root CSS custom properties for documented semantic theme tokens, including canvas background and grid color.
- Gamut-safe OKLCH defaults with separately tuned light and dark values.
- Minimal inherited typography assumptions.
- Host-provided class names only as optional extension points.
- Explicit light, dark, system, and host-overridden grid-color examples.
- Stable focus-visible presentation.
- Motion that respects `prefers-reduced-motion`.
- Interruptible, property-specific transitions only; never `transition: all`.
- Immediate or restrained feedback for high-frequency drag, pan, zoom, marquee, resize, and minimap interactions rather than repeated entrance animations.
- `currentColor` package icons with one coherent stroke weight per toolbar surface; outline icons are default and filled state is reserved for an active toggle.

The playground may use its own styling system, but it must consume the exported package CSS entrypoint in the same way as an unrelated application. Appearance selection is scoped to the workbench root; package styling must not require a global `.dark` class.

### Dependency rules

- Pin checked-in direct dependency versions exactly.
- Use an exact-pinned upstream `@xyflow/react` dependency for the initial adapter spike and implementation.
- Use exact-pinned stable upstream dnd-kit packages for the initial interaction spike. Do not adopt a beta release or copy upstream core merely to obtain an unreleased API.
- Keep dnd-kit types and events behind the package adapter; public move plans, callbacks, and render contracts use package-owned types.
- Begin with upstream optimistic DOM sorting disabled. Replace the package-owned transform preview with upstream behavior only after nested-scroll, zoom, hysteresis, and preview/commit tests prove equivalent or better behavior.
- Do not import non-public dnd-kit source paths or internals.
- Prefer documented XYFlow components, props, hooks, helpers, portals, and lifecycle callbacks over direct store access.
- Do not import non-public XYFlow source paths or rely on undocumented store fields. A documented public `useStoreApi` exception requires a focused need, adapter-only containment, exact-version contract coverage, and a recorded reason that a higher-level API is insufficient.
- Do not add a local XYFlow patch unless the Phase 0 evidence identifies one specific missing public seam and records its test, upstream issue or contribution path, and removal condition.
- Keep React and React DOM as documented peer dependencies.
- Keep the Setta-family dependency count at one package.
- Do not depend on Setta applications, generated clients, or a Setta SDK.
- Do not introduce a backend merely to reuse current behavior.
- Pin an exact pnpm version that supports strict minimum-release-age and loaded-lockfile verification. Set `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `minimumReleaseAgeIgnoreMissingTime: false`, `trustPolicy: no-downgrade`, `trustLockfile: false`, and `blockExoticSubdeps: true`; commit the lockfile, require frozen installs, and reject manifest/lockfile drift.
- Apply the seven-day age floor to external direct and transitive dependencies. Any emergency `minimumReleaseAgeExclude` bypass is limited to one exact package and version and records its rationale, owner, and expiry.
- Re-run pnpm's registry-backed supply-chain verification against the complete loaded lockfile so a dependency resolved through another environment cannot bypass the age policy.
- Reject dependency trust downgrades and exotic transitive sources. A `trustPolicyExclude` entry or direct dependency on Git or a tarball requires an exact package/version or immutable source plus a rationale, owner, and expiry; broad exclusions and movable references are forbidden.
- Deny dependency lifecycle scripts unless one has a specific reviewed need and appears in a narrow allowlist.
- Audit runtime and development dependencies for known vulnerabilities, licenses, and unexpected transitive changes; record any advisory exception by ID with a rationale, owner, and expiry.
- Generate a machine-readable dependency inventory from the lockfile and include all required third-party attribution material in local package verification.

## Accessibility requirements

Drag-and-drop is not pointer-only.

The initial package milestone requires:

- Semantic buttons for section and item drag handles.
- Clear accessible names.
- A labeled toolbar whose built-in and host-injected controls expose pressed and disabled state consistently without relying on tooltips.
- A searchable creation menu with combobox/menu keyboard behavior, a visible query label, empty results, and deterministic focus restoration.
- Inline title editing with `aria-invalid`, an associated error message, polite announcement, Enter commit, Escape cancel, and no focus loss on asynchronous rejection.
- Semantic lock and minimize buttons with state conveyed through `aria-pressed` or `aria-expanded` as appropriate, visible icons, and text alternatives.
- Keyboard selection.
- Modifier-key multi-selection, select-all, and non-marquee alternatives for producing the same batch selection.
- Keyboard group, ungroup, batch lock, batch delete, and persistent stacking commands with specific unavailable-state explanations.
- Keyboard section movement using documented increments.
- Keyboard section resizing using documented increments and constraints.
- Keyboard sibling reordering along the current parent's vertical or horizontal axis.
- Keyboard commands for moving a section into, out of, or between valid containers without requiring pointer free-move.
- An accessible control and announcement for switching between section sorting and free-move modes.
- An accessible orientation control whose label describes the resulting vertical or horizontal layout.
- Keyboard single- and multi-item selection, reorder, indent, and outdent.
- Keyboard commands for switching fixed/content sizing and grow/scroll overflow without requiring a resize-handle double-click.
- Scrollable child containers with an accessible name when they become distinct scroll regions.
- Headerless and transparent chrome with a focusable selected-state action and drag surface; hiding visual chrome must never hide the only keyboard affordance.
- Minimap content treated as supplementary navigation with an accessible name and equivalent focus/fit commands outside the minimap.
- Announcements for drag start, depth and parent changes, valid destination and insertion position, completed move, cancellation, and rejected move.
- Focus restoration after move, delete, undo, and redo.
- Focus restoration after minimizing, expanding, locking, and unlocking.
- No positive `tabIndex` values.
- Visible `focus-visible` states.
- Touch targets suitable for coarse pointers.
- Package controls use at least a 40-by-40 CSS-pixel hit area on desktop and 44-by-44 on coarse-pointer layouts without overlapping neighboring hit targets.
- No required hover-only action.
- Reduced-motion handling for overlays and transitions.
- Pre-mounted polite live regions for routine selection, move, resize, grouping, and validation announcements; assertive announcements are reserved for errors that block the current task.
- Toolbar, menus, title editing, minimap alternatives, and the primary workbench workflow remain usable at 200% browser zoom and reflow without hiding required controls.

When a disabled menu action must remain discoverable so its explanation can be reached, it uses `aria-disabled="true"`, remains in the composite widget's keyboard navigation, blocks pointer and keyboard activation, and exposes the reason. Native `disabled` is used when discoverability is not required.

The exact keyboard mapping must be documented in the playground and package reference.

Horizontal order is logical, not hard-coded left-to-right. Pointer insertion, arrow-key behavior, focus order, and announcements must agree in both left-to-right and right-to-left documents.

Grid marks are decorative and hidden from the accessibility tree. Grid, snapping, and appearance controls in the playground expose their current state without relying on color alone.

Accent and tag colors are also supplementary. Selection, grouping, locks, invalid drops, and read-only state retain icon, outline, text, or semantic state cues independent of color.

## Performance requirements

Frontend performance is an initial package requirement.

Before implementation, record baseline behavior for equivalent current Setta interactions where a trustworthy comparison exists. Store append-only reports under `perf/` when the work occurs in this repository.

The standalone package must be profiled for:

- Panning and zooming a large set of lightweight sections.
- Dragging one section at multiple zoom levels.
- Marquee-selecting and moving a large top-level sibling set.
- Updating selection without rerendering unrelated host bodies.
- Rendering and panning the minimap for a large root set.
- Moving and resizing with snapping enabled at multiple zoom levels.
- Reordering a section in large vertical and horizontal sibling lists.
- Free-moving a section between the canvas and deeply nested containers.
- Rendering and updating a deeply nested mixed-orientation section tree.
- Resizing a section containing interactive content.
- Switching between fixed/content sizing and grow/scroll container overflow without observer loops or repeated canonical writes.
- Reordering a large flat item list.
- Reparenting items in a deeply nested item tree.
- Selecting and moving a large sibling block in an item tree.
- Typing into an input while section and item DnD are enabled.
- Switching light and dark appearance without remounting host section renderers.
- Minimizing and expanding sections with large host bodies and nested descendants.
- Mounting and unmounting the workbench without leaked subscriptions or observers.

Prefer structural guardrails such as render counts, subscribed-state breadth, DOM node counts, and changed-item counts. Establish timing thresholds only after measuring a stable baseline; do not invent arbitrary budgets.

The design should:

- Subscribe each section and item to the smallest practical state slice.
- Avoid rerendering every section during one section drag.
- Avoid rerendering every section during marquee updates, active-section render lift, minimap viewport movement, or one content-size observation.
- Keep transient drag state separate from the canonical document.
- Keep XYFlow `onNodesChange`, resize, selection, and viewport events inside the transient adapter projection unless a completed package command explicitly crosses the document boundary.
- Keep live content measurements and active z-index lift separate from the canonical document.
- Derive the parent lookup once per committed structure and update it incrementally; do not rebuild it on every pointer event.
- Maintain one incremental measured-geometry index for root and nested frames instead of separately remeasuring for marquee, selection bounds, focus/fit, collision, and external drop.
- Limit collision and geometry work to viable ancestors, descendants, siblings, and visible targets instead of rescanning the complete section tree on every pointer event.
- Batch geometry reads and writes.
- Incrementally update minimap and selection bounds from already-owned geometry rather than measuring the complete DOM again.
- Guard content-size observers against feedback loops, subpixel churn, and work after unmount.
- Use animation frames only for actual visual synchronization.
- Leave room for viewport culling without making it an initial-milestone dependency.

## Implementation phases

### Phase 0: Boundary, evidence, and repository setup

Status: **in progress** (updated 2026-08-08).

- Completed: dedicated blank-slate branch from recorded source commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; minimal private workspace, package, Node-only playground, unrelated consumer fixture, exact toolchain pins, new-tree hygiene files, package-specific repository instructions, baseline deterministic quality/packaging/supply-chain tooling, and initial source-linked interaction evidence.
- Completed: reviewable tooling carryover inventory plus negative-tested repository-tree, application-import, source-escape, and undeclared-package-export boundary enforcement wired into changed-file quality checks.
- Completed: framework-neutral, source-linked interaction fixtures for scaled geometry, combined selection bounds, selection-root normalization, canonical sibling-block order, collision ranking and hysteresis, nested target promotion, stale-target clearing, vertical and horizontal transform-stable previews, deterministic sort/free move planning and immutable application, and single-owner arbitration across pointer, touch, and keyboard activation.
- Completed: exact-pinned `@xyflow/react@12.11.2` and `@dnd-kit/react@0.5.0`; documented-public-API adapters with no XYFlow store access or upstream declaration leakage; root-node/recursive-DOM representation; one incremental all-depth geometry index; adapter-local transient root projection; explicit optimistic-sorting decision; and focused Node-only browser evidence for zoom-aligned nested selection, resizing, focus/scroll isolation, keyboard cancellation, pointer handoff, transient lift, one-command completion, accessibility, reduced motion, and 320-pixel reflow. The declaration-only `@xyflow/system@0.0.79` patch has an exact scope, owner, expiry, upstream contribution path, and removal condition in the evidence.
- Completed: positive-area partial/full all-depth marquee queries, measured selection-root normalization, readiness-aware bounds, measurement-gated initial fit, combined deep-selection overlays aligned at 0.5x/1x/2x zoom, a keyboard-reachable selection alternative, and the first repeatable non-gating 2,000-frame shared-geometry performance baseline.
- Completed: the updated frozen lockfile passed strict loaded-lockfile policy, exact patch metadata, high/critical vulnerability audit, dependency-license allowlist, machine-readable inventory generation, and an unrelated packed-consumer installation.
- Remaining: complete the unproved interaction-owner cells; minimum/default/maximum selection-block drag completion across collision, placeholders, canvas drops, and preview/commit parity; the full behavior/browser characterization matrices; representative browser render-count baselines; interactive CDP review; and the final Phase 0 gate audit.

Produce:

- A dedicated blank-slate implementation branch in this working directory, created from a recorded clean `main` commit without another worktree.
- A minimal private pnpm workspace containing only the package, playground, consumer fixture, documentation, and selected project-appropriate development tooling.
- A tooling carryover inventory that maps each retained policy and threshold to a blank-branch configuration or script and explicitly rejects application/runtime tooling that is not needed.
- Minimal new-tree `.gitattributes`, `.gitignore`, `.editorconfig`, `.node-version`, package-manager declaration, and a rewritten package-specific `AGENTS.md`; none is copied wholesale from the application tree.
- A blank consumer fixture with no Setta aliases.
- A reference inventory classifying current code as reusable pure logic or behavioral evidence, with application-coupled UI excluded from the implementation base.
- A committed evidence manifest tied to the recorded source commit, plus generic executable fixtures for zoom geometry, collision hysteresis, nested targeting, selection-root normalization, preview stability, and move planning. Each fixture identifies its current source behavior and any copied-code attribution without retaining the old component or store.
- A self-contained Node/Vite playground runner and Playwright configuration with no Go, Python, authentication, generated API, or Setta runtime bootstrap; representative screenshot, performance, keyboard, focus, accessible-name/role/state, announcement, zoom, reduced-motion, and automated accessibility checks run through it.
- A generated public-API report and automated package-contract suite covering declarations, subpath exports, CSS, tree shaking, tarball allowlisting, consumer installation, and forbidden internal imports.
- The upstream XYFlow adapter representation decision and its evidence. Begin with root sections as XYFlow nodes plus package-rendered recursive DOM and require a challenger representation to prove a material advantage without losing ordered layout, nested scrolling, all-depth selection, accessibility, or single-owner movement. The default dependency-versus-fork decision is already upstream dependency.
- A focused upstream-adapter proof covering recursive rendering, all-depth measured geometry, selection at depth, cross-coordinate-space movement, nested resizing, transient ancestor lift, scroll isolation, fit readiness, focus-induced browser scrolling, and high-frequency rerender behavior.
- A geometry-index proof showing that root and descendant registration, updates, and cleanup produce one workbench-coordinate source for marquee, selection bounds, focus/fit, collision, canvas drops, and any nested minimap summary.
- An interaction-owner matrix and proof covering ordinary XYFlow root drag, dnd-kit sorting, dnd-kit free-move, selection-block movement, viewport gestures, pointer, touch, keyboard, cancellation, and mode changes. Each cell identifies exactly one movement owner and the disabled competing activators.
- A transient-projection proof showing that XYFlow node, selection, resize, viewport, and measurement events do not become canonical document changes per frame and that one completed accepted gesture emits at most one package command and, when the command is undoable, one history entry.
- The exact-pinned stable dnd-kit dependency, adapter boundary, optimistic-sorting decision, and third-party license-compatibility decision.
- A current-code inventory for both XYFlow and dnd-kit that separates upstream-replaceable adapter machinery, the package-owned interaction kernel, and Setta application coupling. The inventory must identify the executable specification for every retained interaction before its current source is removed.
- A section-DnD behavior matrix covering sorting mode, free-move mode, single and sibling-block movement, parent transitions, midpoint transitions, invalid targets, vertical and horizontal parents, cancellation, constrained scrolling, and minimum, default, and maximum zoom.
- Focused characterization tests for current move planning, collision ranking, previous-target preference, previous-rectangle retention, trigger-distance and midpoint transitions, child-over-parent promotion, orientation-specific sorting, selection-shaped collision geometry, stale-target clearing, and layout-stable preview transforms.
- A differential proof against the selected exact-pinned stable dnd-kit release showing which provider, sensor, measuring, overlay, feedback, and sortable responsibilities upstream can own without changing the characterized behavior.
- A scaled-ancestor proof that keeps pointer deltas, single- and multi-selection rectangles, collision targets, insertion placeholders, drag overlays, and canvas-drop coordinates aligned through XYFlow zoom and nested scrolling.
- A behavior inventory for current locking, minimizing, fixed/content resizing, group overflow, movement/resize snapping, grid rendering, configurable viewport gestures, scroll isolation, transient and persistent stacking, smart placement, inline naming, selection, grouping, minimap, toolbar controls, section chrome, accents, and appearance selection.
- Characterization notes for current parameter multi-selection, normalized-root dragging, shared-parent restrictions, batch keyboard movement, and drag-overlay measurement.
- Baseline interaction and performance notes.
- An explicit list of package-owned types.
- Import-boundary checks.
- Exact-pinning, strict seven-day minimum-release-age, no-trust-downgrade, exotic-transitive-source blocking, frozen-lockfile, dependency-lifecycle-script, license, local-package-contents, dependency-inventory, registry-backed loaded-lockfile verification, and vulnerability-audit commands with documented failure and exception policies.

Gate:

- The branch contains no current Setta application, backend, plugin, generated API, deployment, installer, release, or migration implementation.
- The repository pins Node and pnpm exactly, contains only new-tree hygiene configuration, and has package-specific `AGENTS.md` instructions with no stale application paths or commands.
- The empty package builds, tests, and packs.
- The consumer fixture installs the packed artifact.
- Formatting, linting, strict type-checking, dead-code, complexity, file-length, unit-test, build, local-pack, and package-boundary checks run through the blank branch's own Node-based quality entrypoint.
- The playground and Playwright harness start from Node-only commands. Automated accessibility scanning passes, and explicit keyboard completion, focus restoration, accessible name/role/state, dynamic announcement, 200% zoom, and reduced-motion checks cover the representative workflow.
- The public-API report is reviewable, and the package-contract suite proves every declared subpath, declaration, CSS entrypoint, tree-shaken consumer build, tarball allowlist, and forbidden-internal-import boundary.
- A frozen install succeeds from the checked-in lockfile; every direct dependency is exactly pinned; dependency lifecycle scripts are denied unless explicitly reviewed and allowlisted.
- pnpm rejects external direct and transitive dependencies published less than seven days earlier, rejects missing publication times, and re-verifies the complete loaded lockfile against the same threshold rather than trusting it.
- Every `minimumReleaseAgeExclude` entry names one exact package and version, rationale, owner, and expiry; package-name, pattern, or permanent exclusions fail verification.
- pnpm rejects a dependency trust downgrade and exotic transitive source. Every `trustPolicyExclude` entry and direct Git/tarball dependency is immutable, narrowly documented, owned, and expiring.
- The local package-contents audit and machine-readable dependency inventory are reproducible from the clean checkout.
- The vulnerability audit covers runtime and development dependencies, fails on unwaived high or critical advisories, reports lower severities for triage, and contains no unbounded or unexplained suppression.
- No Setta application import is available to the package.
- No compatibility layer, old/new feature flag, current project-model adapter, or copied application component exists in the package.
- The XYFlow proof uses documented upstream APIs and records which section representation it selected. Root-node plus recursive-DOM projection remains the choice unless a challenger passes every representation criterion with better evidence.
- Any use of the documented public XYFlow store API is adapter-local, exact-version tested, justified by a specific missing higher-level seam, and absent from public declarations. Otherwise the adapter uses higher-level public components, props, hooks, and helpers only.
- The package geometry index covers every visible section depth and is the only measurement source used by all-depth marquee, combined selection bounds, focus/fit, collision planning, and nested external-drop coordinates.
- XYFlow root drag, dnd-kit sorting/free-move, selection-block movement, and viewport gestures never own the same pointer, touch, or keyboard movement simultaneously, including cancellation and runtime mode changes.
- High-frequency XYFlow and measurement events remain transient. A completed root move or resize produces one accepted document change and one history entry, and cancellation produces neither.
- Initial fit and section focus wait for relevant measurements, and focusing interactive content cannot leave an independent browser scroll offset that diverges from the canvas viewport.
- Any proposed XYFlow patch has a smaller demonstrated scope than a fork and an explicit removal condition; otherwise the implementation remains unpatched upstream.
- The upstream dnd-kit proof uses public APIs, keeps package contracts free of dnd-kit types, and records every custom behavior that remains package-owned.
- Optimistic DOM sorting remains disabled unless the proof demonstrates stable constrained scrolling, unchanged target hysteresis, and exact preview/commit parity.
- License obligations are understood before source is copied.
- The evidence manifest, generic test vectors, intentionally ported pure algorithms, and associated notices are sufficient to reproduce each retained interaction outcome without either legacy fork or application component being present.
- The required interaction kernel is explicit and reproducible without depending on memory or visual guesswork; deleting the current implementation cannot delete its only executable specification.

### Phase 1: Serializable canvas shell

Implement:

- `WorkspaceDocument` and validation.
- Canonical recursive child lists and a derived parent lookup.
- Controlled and uncontrolled state.
- Host capabilities, `readOnly`, and the public controller boundary.
- The upstream XYFlow adapter and canvas container without exposing XYFlow contracts, including an adapter-owned transient root-node projection and the package geometry-service boundary.
- Configurable pan-on-drag, pan-on-scroll, wheel, pinch, and double-click zoom with documented bounds and temporary activation keys.
- Viewport gesture lifecycle coordination that keeps live transforms responsive and coalesces persisted viewport publication at the documented completion boundary.
- Host-renderer pan/wheel suppression primitives and scroll arbitration.
- Background, viewport updates, focus-section, fit-section, fit-to-sections, and deterministic next/previous traversal helpers.
- Independently controlled grid visibility and snapping with shared workbench-unit spacing.
- Dots, lines, and cross grid patterns with configurable mark size.
- Scoped light, dark, and system appearance resolution.
- Package CSS and semantic theme tokens, including separate canvas and grid colors.
- The built-in viewport toolbar, typed host-control placements, richer overlay slots, and an empty-state minimap shell.
- A minimal playground page.
- Document JSON display for debugging.

Tests:

- Public declaration output contains no XYFlow node, edge, store, or change-event types.
- The exact-pinned upstream dependency is sufficient without private source imports.
- The adapter's transient root-node and viewport events cannot mutate a document except through the package command boundary.
- Document round trip.
- Arbitrarily deep mixed-orientation document round trip.
- Invalid document failures for duplicate placement, unreachable sections, cycles, unknown children, invalid orientations or overflow modes, unsupported size or chrome modes, invalid colors, empty titles, and non-finite root positions or dimension fallbacks.
- Controlled/uncontrolled contract.
- Capability changes without remounting and specific layout, structure, and presentation command rejection in read-only mode.
- Viewport conversion at multiple zoom values.
- Every supported gesture combination, zoom bound, activation key, and host-content scroll/pan suppression path.
- Grid rendering and snap alignment at multiple pan offsets, zoom values, and negative coordinates.
- Snapping with the grid hidden and a visible grid with snapping disabled.
- Light, dark, system-preference, and host-token override behavior without global class mutation.
- Toolbar-control registration, ordering, state, cleanup, and controller-only access.
- Empty minimap mount, viewport synchronization, and cleanup.
- Mount, observer, event-listener, and subscription cleanup.
- Consumer-fixture build.

Gate:

- The playground renders and manipulates an empty workbench with no backend, exposes a working default toolbar, and accepts one injected host control.
- Its grid remains aligned while panning and zooming, and its canvas and grid colors respond to the resolved appearance.
- Scrollable host fixture content can consume wheel input without moving the canvas, while canvas wheel input follows the selected gesture policy.
- Reloading a valid document restores the viewport exactly.
- A valid recursive document restores the same containment, sibling order, and orientation at every depth.

### Phase 2: Free canvas and top-level section foundation

Implement:

- Section registry including creation metadata, sizing defaults, and chrome variants.
- Root-section projection derived from the canonical document and backed by adapter-local transient position and size state during gestures rather than mutating the document object per frame.
- Package-owned measured-frame registration and a selection overlay mounted through a documented viewport portal or equivalent public seam.
- Generic section frame, header, inline title editing, and selected-state chrome for headerless sections.
- Per-section accent and tag colors with accessible defaults and reset.
- Palette-based and searchable right-click creation.
- Pure smart-placement planning and creation focus behavior.
- Generic external-drop coordinates, candidate feedback, and host callback without native file semantics.
- Single selection, modifier multi-selection, partial/full marquee selection, normalized selection roots, and select-all.
- Ready-made selection context actions with specific disabled reasons.
- Transient active-section stacking and explicit persistent stacking commands.
- Pannable and clickable minimap nodes for populated roots.
- Section drag handle.
- Zoom-correct single and top-level sibling-block movement with relative-offset preservation.
- Constraint-aware, zoom-correct resizing with optional snapping.
- Per-axis fixed/content sizing, manual promotion to fixed sizing, and double-click/keyboard return to content sizing.
- Position-and-size locking.
- Minimizing and expanding without losing fixed dimensions or content-fit modes and fallbacks.
- Single and batch lock/delete operations.
- Top-level grouping and ungrouping through the same canonical containment model used by Phase 3.
- Host capability enforcement across every package-owned affordance.
- Structural history.
- JSON import/export and playground local persistence.
- Note and counter/status example sections.

Tests:

- Register and render unrelated host components.
- Create from the palette and keyboard/context menu, smart-place without overlap, rename, move, resize, switch size modes, lock, unlock, minimize, expand, select, marquee, batch move, group, ungroup, delete, restyle, restack, undo, and redo.
- Drag at minimum, default, and maximum documented zoom.
- Move and resize with snapping enabled and disabled.
- Enforce resize axes, minimum size, maximum size, and aspect ratio.
- Measure content-sized host bodies, promote them to fixed sizing on manual resize, and return them to content sizing without observer loops.
- Prevent direct movement and resizing of a locked section while leaving its content and child container usable.
- Keep nested children visible when their parent section body is minimized, then restore fixed dimensions exactly, resume content-fit dimensions, and restore focus.
- Interactive content does not initiate section dragging.
- Partial/full marquee geometry, ancestor/descendant root normalization, top-level block offsets, locked-selection rejection, and selection focus restoration.
- XYFlow registered-node selection is disabled or reconciled behind the package selection model so it cannot become a second selection authority.
- XYFlow position and resize events update the transient projection during a gesture, emit exactly one accepted document change at completion, and emit none on cancellation.
- Focusing an offscreen section or interactive descendant changes or preserves the canvas viewport deliberately and never leaves an independent browser scroll offset on the workbench wrapper.
- Transient render lift without document/history changes and explicit persistent stack commands with undo/redo.
- Read-only and independent layout, structure, and presentation capability combinations.
- Search filtering, keyboard creation coordinates, empty results, selection-context availability, async title rejection, and external-drop host acceptance/rejection.
- Toolbar, minimap, keyboard movement, and focus restoration.
- Large-section-set render/update behavior.

Gate:

- A consumer can register two section kinds, create and rename them through ready-made UI, arrange them singly or as a selection, customize their chrome, reload them, and recover the same document.
- One move or resize gesture produces one persisted document change and one history entry.
- Title, size mode, lock, minimized, presentation, group, and persistent stacking state round-trip through JSON and restore exactly through undo and redo.
- Smart creation, marquee selection, minimap navigation, toolbar extension, and host capabilities work without a backend.

This is an internal milestone, not a releasable top-level-only product. The root model and section frame must already accommodate recursive children so Phase 3 does not require a second document model or a compatibility layer.

### Phase 3: Recursive section layout and dual-mode DnD

Implement in this order:

1. Pure containment validation, descendant checks, and derived parent lookup.
2. Recursive child-section rendering with no hard-coded depth limit.
3. Registration of every visible descendant frame in the same workbench-coordinate geometry index used by roots, including cleanup and bounded remeasurement through recursive reflow.
4. All-depth marquee, focus/fit, and combined selection bounds from that geometry index without registering ordered descendants as independent spatial roots.
5. Vertical child layout, then horizontal child layout using logical inline order.
6. Grow-with-children sizing, fixed scroll overflow, stable mode switching, scroll isolation, and the empty-container drop affordance.
7. Orientation changes that preserve hierarchy and child order.
8. Interaction-owner arbitration that disables XYFlow root movement and conflicting viewport gestures while dnd-kit sorting or free-move owns the operation, then restores ordinary root dragging without stale activation.
9. Pure sorting-mode move planning for one section or a selected sibling block within the current parent.
10. Pure free-move planning for one section or a selected sibling block across canvas-to-nested, nested-to-canvas, and nested-to-nested moves at unrelated depths.
11. Orientation-aware insertion placeholders and commit parity.
12. Selection-shaped collision geometry that ignores every moving selection root while preserving the selected block's combined drag bounds.
13. Stateful collision ranking, previous-target and previous-rectangle retention, child-over-parent promotion, midpoint tracking, zoom-scaled directional trigger distances, and stable target hysteresis based on the Phase 0 characterization.
14. A layout-stable transform preview that does not optimistically reorder constrained-scroll DOM unless the Phase 0 proof established equivalence.
15. Cycle, self, descendant, mixed-parent batch, active-section lock, and host-policy rejection.
16. Group and ungroup at any supported depth for selected siblings with one shared parent.
17. Keyboard reorder and cross-container movement with focus restoration and announcements.
18. A container example with mixed vertical and horizontal descendants at least three levels deep.

Tests:

- Same-parent sorting in vertical and horizontal containers.
- Horizontal pointer and keyboard order in left-to-right and right-to-left documents.
- Free move from canvas to nested, nested to canvas, a shallow source to an unrelated deeper container, a deep source to a shallower valid container, and between cousin containers.
- Move into an empty container and to the first and last sibling position.
- Move selected sibling blocks in vertical and horizontal parents, into and out of containers, and back to the canvas while preserving order or top-level offsets.
- Marquee-select, focus, fit, and compute combined selection bounds for visible descendants at unrelated depths using the shared geometry index at minimum, default, and maximum zoom.
- Switch repeatedly between ordinary XYFlow root dragging, sorting, and free-move; verify exactly one movement owner, no viewport leakage, no duplicate delta, no stale activation, and matching pointer, touch, keyboard, completion, and cancellation outcomes.
- Reject mixed-parent batch movement specifically and normalize parent-plus-descendant selections before every structural command.
- Reject self, descendant, and host-invalid destinations without changing canonical state.
- Reject direct sorting, reparenting, movement, and resizing of a locked active section while allowing that section's unlocked descendants and host controls to remain usable.
- Allow a locked container to remain a destination unless host policy rejects it.
- Preserve visible placement while crossing coordinate spaces and resolve final canvas positions correctly at minimum, default, and maximum zoom.
- Keep pointer deltas, the combined selection rectangle, collisions, insertion placeholders, and drag overlays aligned at minimum, default, and maximum zoom with nested containers both growing and internally scrolling.
- Keep the previewed parent and index identical to the committed plan.
- Hold a stable target and reference rectangle while the pointer jitters or feedback layout changes around sibling midpoints and parent-child boundaries; change it only after the applicable directional entry or exit threshold is crossed.
- Prefer the valid child insertion target over its containing parent when both collide, without flickering between them.
- Exclude every moving selection root from collision candidates and move the selected block atomically from its combined drag geometry.
- Clear stale targets when leaving all droppable regions or canceling.
- Change orientation without changing containment or logical child order.
- Switch a populated container between grow and scroll modes without a visual size jump; verify internal wheel isolation and return to grow mode.
- Render the empty-container drop affordance, accept a drop through it, and remove the affordance when populated.
- Group and ungroup siblings at root and nested depths, reject mixed-parent grouping, and restore exact structure through undo/redo.
- Render and interact with a deeply nested mixed-orientation tree without a package-imposed depth cutoff.
- Undo and redo single and batch reparenting, sorting, grouping, ungrouping, resizing, size/overflow mode changes, lock changes, minimize changes, orientation changes, and subtree deletion exactly.

Gate:

- A user can start with a section at any depth and, in free-move mode, place it on the canvas or inside any valid container at any other depth.
- A user can switch to sorting mode and reorder nested siblings without accidentally reparenting them.
- A user can select sibling sections, move or group them atomically, and ungroup them without identity or order loss.
- Vertical and horizontal parents produce matching layout, insertion, keyboard, and announcement behavior.
- A nested container can grow with its children or retain a stable bounded size with an internally scrollable child region.
- Marquee, combined selection bounds, focus/fit, collision, and nested drop coordinates agree on one measured frame for every visible section at every depth.
- XYFlow spatial dragging, dnd-kit structural dragging, and viewport gestures remain mutually exclusive movement owners through mode changes and cancellation.
- The characterized Setta zoom coordination, selection-shaped collision, preview stability, and target hysteresis are preserved or deliberately improved with evidence.
- Recursive section operations remain deterministic, serializable, accessible, and zoom-correct.

### Phase 4: Sortable items inside a section

Implement in this order:

1. Pure generic tree validation and move planning.
2. Single and modifier-key multi-item selection with normalized roots.
3. Flat single-item and selected-sibling-block reorder.
4. Nested parent-child reorder.
5. Move one item or a selected sibling block into and out of a parent.
6. Shared-parent validation, mixed-parent batch feedback, and host `canMove` rejection.
7. Keyboard reorder, indent, and outdent for the selected roots.
8. Zoom-aware multi-item placeholder and overlay measurement.
9. Outer-section and inner-item interaction arbitration.
10. Multi-item-aware `applyItemMove` helper.
11. Field-list example section with real inputs and one nested group.

Tests:

- Same-parent reorder.
- Cross-parent move.
- Stable-order multi-item reorder and cross-parent move for a selected sibling block.
- Parent-plus-descendant selection normalization and mixed-parent drag fallback or rejection.
- Move to an empty parent.
- First and last insertion.
- Cycle rejection.
- Invalid index rejection.
- Host rejection.
- Drag cancellation.
- Input interaction during enabled DnD.
- Item drag at multiple workbench zoom levels.
- Section drag followed by item drag and the reverse.
- Pointer, touch, and keyboard outcomes.
- Focus and accessibility announcements.

Gate:

- A field-list section remains fully editable while its items can be reordered and nested.
- The host receives one deterministic atomic move plan containing one item or an ordered selected sibling block.
- The item structure round-trips through the playground's persistence.
- No item interaction mutates `WorkspaceDocument` unless the host explicitly stores that item data in a section payload.

### Phase 5: Hardening and reusable package milestone

Complete:

- API review and naming cleanup.
- Package exports.
- A generated declaration-based public-API report reviewed for intentional exposure; it is a review artifact, not a compatibility promise or generator-drift test.
- Generated declaration files.
- Package CSS entrypoint.
- README quickstart.
- Controlled and uncontrolled examples.
- Host capability, toolbar extension, public controller, smart placement, external drop, minimap, selection, grouping, and stacking guides.
- Recursive-section, drag-mode, and orientation guide.
- Locking, minimizing, fixed/content sizing, grow/scroll overflow, grid, snapping, section presentation, and appearance guide.
- Single- and multi-item sortable-tree guide.
- Theming guide.
- Accessibility and keyboard guide.
- Performance report.
- Browser visual, keyboard, accessibility, and performance verification through the self-contained playground harness.
- Consumer-fixture installation from a locally packed artifact.
- Third-party dependency and source-license audit, attribution record, machine-readable dependency inventory, minimum-release-age audit, and vulnerability-audit results.
- A verified private manifest with no registry publishing or release-automation configuration.

Gate:

- An unrelated React application can install the packed package, register its own section renderer, create and rename through ready-made UI, arrange one or more top-level sections, recursively nest and sort sections, group, ungroup, lock, minimize, content-fit, resize, scroll containers, snap, theme section chrome, use a minimap, extend the toolbar, change child orientation, and add a multi-item sortable tree without importing package internals.
- The package contains no Setta application or backend dependency.
- The package contains no compatibility, migration, legacy, dual-path, or transitional code for the current Setta frontend.
- Focused unit, integration, E2E, accessibility, performance, package-boundary, and deterministic supply-chain checks pass.
- The complete external dependency lockfile satisfies the seven-day minimum-release-age policy except for narrow, owned, unexpired exact-version exceptions.
- Dependency trust has not downgraded, exotic transitive sources are blocked, and any direct immutable-source or exact-version trust exception is narrow, owned, and unexpired.
- A current network-backed vulnerability audit passes the documented policy, or every non-passing advisory has a narrow, owned, expiring exception.
- The playground demonstrates the complete primary workflow.

### Phase 6: Deferred capability expansion in the same package

The initial package milestone does not wait for browser windowing or domain-safe clipboard integration. They remain intended capabilities of `@setta/workspace`, not separate domain products. Whether any version is distributed publicly remains a separate decision.

Implement detachable sections as an optional React export:

- A section definition opts in with `detachable: true`.
- A user-initiated action may portal the existing renderer into a same-origin browser window while preserving React context, document identity, and controlled state.
- The canvas retains a measured placeholder with focus-window and redock actions so containment and sibling geometry do not collapse.
- Package CSS, resolved theme variables, title, and accessibility metadata are installed into the pop-out document without mutating unrelated host styles.
- The host supplies explicit renderer-specific window-head contributions when its content needs additional styles or fonts; the package does not scrape or clone arbitrary inaccessible host stylesheets heuristically.
- Closing the window redocks the section predictably. Popup blocking produces specific feedback and leaves the section on the canvas.
- Pop-out creation requires a direct user gesture, same-origin access, and a still-live opener. Reload or opener loss falls back to a clear unavailable/redock state rather than silently creating a second document owner.
- Cross-window drag-and-drop is not implied; users redock before moving or nesting the section.
- Window bounds and open/closed state are host UI preferences, not required `WorkspaceDocument` fields. Hosts may persist them separately.
- A renderer may reject detachment when it depends on unsupported document globals or external resources.

Implement adapter-driven copy and paste:

- The package owns selection shortcuts, subtree extraction, structural validation, relative placement, and clipboard MIME framing.
- The host supplies ID allocation and cloning for section payloads and domain references. Controlled hosts may perform the complete clone on a backend and return the accepted subtree.
- A documented JSON-only adapter supports the backend-free playground using explicit structured-clone eligibility rather than assuming arbitrary payloads are safe.
- Paste smart-places the copied root block near the last meaningful canvas location or current selection and commits one history entry.
- Clipboard payloads are treated as untrusted input and pass schema, kind, containment, size, color, and host-clone validation before any renderer mounts.
- Invalid, unauthorized, unsupported-version, or partially cloneable payloads fail specifically without inserting a partial subtree.

Then evaluate or implement independently:

- An optional hierarchical outline navigator built on the initial controller and traversal helpers.
- Pure top-level auto-layout and packing commands.
- Multiple named item lists within one section.
- Cross-list item movement.
- Filtered-list reordering against a larger canonical tree.
- Mixed-parent batch section and item dragging if a deterministic interaction proves understandable.
- Saved viewport presets.
- Generic edges and ports.
- Pane registration beyond toolbar and overlay slots.
- Viewport culling.
- Absolute/freeform positioning inside nested containers.
- Collapsing an entire descendant subtree as part of section minimization.

Each follow-on addition must preserve the standalone one-sentence purpose, remain in the same package unless independently useful, and prove that its data ownership is generic rather than inherited from Setta application behavior.

## Testing strategy

### Core unit tests

Cover:

- Document validation and serialization.
- Recursive containment validation and derived parent lookup.
- Coordinate conversion across canvas and nested placement contexts.
- Smart placement inside and outside viewport bounds with deterministic non-overlap and grid behavior.
- Root minimap projection and all-depth focus/fit bounds from the shared geometry index.
- Marquee intersection and containment geometry, selection-root normalization, deterministic navigation order, and combined selection bounds at every visible depth.
- Section single/block sorting, free-move, grouping, ungrouping, orientation, batch subtree deletion, persistent stacking, resize, size mode, overflow, presentation, title, lock, and minimize reducers.
- Movement and resize snapping at positive and negative coordinates.
- Resize-axis, fixed/content promotion, minimum, maximum, and aspect-ratio constraint resolution.
- Light, dark, and system appearance resolution plus semantic token merging, sRGB gamut checks, APCA targets, and WCAG 2 compatibility measurements.
- Accent and tag-color parsing, gamut handling, semantic-role isolation, and accessible token derivation.
- Vertical and horizontal insertion-index planning.
- Collision ranking, previous-target preference, previous-rectangle retention, child-over-parent promotion, midpoint transitions, zoom-scaled directional trigger distances, target hysteresis, and stale-target clearing.
- Selection-bound geometry, selected-root collision exclusion, and coordinate correction for single and multi-section drags under a scaled viewport.
- Layout-stable sortable preview transforms and exact preview/commit parity without constrained-scroll jumps.
- History coalescing and restoration.
- Item-tree validation.
- Single- and multi-item selection normalization and move planning.
- Section and item cycle and invalid-target rejection.
- Applying a move plan without mutating the input.
- Deterministic outputs.

### React integration tests

Cover:

- Controlled and uncontrolled rendering.
- Read-only and independent layout, structure, and presentation capabilities changing at runtime.
- Section registry behavior.
- Registry-driven searchable creation, inline title editing and rejection, smart placement, and external-drop callbacks.
- Unknown-kind handling.
- Default, compact, transparent, and headerless chrome plus accent and tag presentation.
- Recursive rendering across mixed vertical and horizontal layouts.
- Root-node projection, recursive-DOM descendant measurement, geometry-index cleanup, and agreement among marquee, selection bounds, focus/fit, collision, and nested drop coordinates.
- Sorting-mode and free-move-mode activation, preview, cancellation, and commit.
- Mutual exclusion among XYFlow root drag, dnd-kit sorting/free-move, selected-block movement, and viewport gestures through pointer, touch, keyboard, cancellation, and runtime mode changes.
- Single and sibling-block cross-depth movement, root normalization, grouping, ungrouping, and orientation changes.
- Lock behavior for top-level and nested sections without disabling host content or descendants.
- Minimize and expand behavior with exact fixed-size restoration, content-fit resumption, and focus restoration.
- Resize gestures, fixed/content sizing, grow/scroll overflow, wheel isolation, and keyboard resizing with constraints and optional snapping.
- Marquee selection, partial/full containment, batch movement, batch actions, and transient render lift.
- Independent grid visibility and snap settings.
- Scoped light, dark, system, and custom-token appearance behavior.
- Configurable viewport gestures, built-in toolbar, host toolbar controls and overlays, minimap interaction, and controller helpers.
- Section and item drag scopes.
- Input, button, and text-selection interaction.
- Pointer cancellation.
- Transient XYFlow position, resize, selection, viewport, and measurement events staying outside canonical document history until the package completion boundary.
- Keyboard interactions.
- Focus restoration.
- Subscription and observer cleanup.
- Host rejection behavior.

### Browser E2E tests

Cover the real playground:

- Create through palette, context menu, and keyboard; smart-place, rename, restyle, move, resize, content-fit, lock, minimize, persist, and reload.
- Configure every viewport gesture family, use scrollable host content without moving the canvas, and operate the built-in and host-injected toolbar controls.
- Navigate through the minimap and focus/fit helpers without losing selection or host state.
- Marquee-select with partial and full containment, move the selected block, batch lock/delete, group, ungroup, and use explicit stacking commands.
- Marquee-select and focus/fit nested descendants at unrelated depths, then verify their bounds agree with collision and drop geometry through pan, zoom, recursive reflow, grow/scroll changes, and minimization.
- Focus interactive content in offscreen root and nested sections without producing an independent workbench-wrapper scroll offset or unexpected canvas movement.
- Build a section tree to multiple depths, then move sections into, out of, and between nested containers.
- Move selected sibling blocks through representative root and nested transitions and reject mixed-parent batch movement.
- Reorder vertical and horizontal siblings in sorting mode.
- Switch a populated container between vertical and horizontal orientation without changing logical order.
- Switch a populated container between grow and scroll overflow, scroll it without panning the canvas, and return it to grow mode.
- Exercise stable drop targeting near sibling and parent-child boundaries at multiple zoom levels.
- Verify move and resize snapping while the grid is visible and hidden.
- Verify dots, lines, and cross patterns with custom grid colors in light and dark appearance.
- Verify per-section accents and tag colors across every chrome variant without obscuring semantic state.
- Verify locked sections cannot be directly moved or resized but remain interactive and can contain unlocked children.
- Verify minimizing hides only the host body, retains nested children, restores fixed dimensions exactly, and resumes content-fit dimensions.
- Import and export.
- Undo and redo.
- Pan and zoom.
- Single- and multi-item selection, reorder, nesting, indent, and outdent.
- Accept and reject external drops at root and nested coordinates without invoking native file semantics inside the package.
- Enforce read-only and granular layout/structure/presentation capabilities without a gesture starting and then snapping back.
- Invalid self, descendant, locked-active-section, and host-rejected move feedback.
- Keyboard-only completion of the primary workflows.
- Multiple viewport sizes.
- Browser zoom at 200% with the toolbar, creation menu, title editor, selection actions, and equivalent minimap navigation still reachable.
- Coarse-pointer interaction where automation supports it.

Run browser verification through the documented CDP workflow. Visual review must include default, single-selected, marquee, multi-selected, selection-dragging, grouped, locked, read-only, minimized, fixed-size, content-size, grow-overflow, scroll-overflow, sorting, free-moving, snapped movement, resize handles, nested-parent preview, empty-container affordance, sibling insertion preview, invalid-drop, vertical, horizontal, default/compact/transparent/headerless chrome, accent and tag colors, toolbar default and host controls, minimap on both sides, context-menu filtering and empty results, grid-hidden, each grid pattern, custom grid color, light appearance, dark appearance, focus-visible, right-to-left, coarse-pointer, and reduced-motion states.

### Consumer, packaging, and supply-chain tests

- Create a local package tarball without publishing it.
- Inspect the tarball allowlist so application source, tests, secrets, local configuration, and undeclared files cannot leak into the package.
- Install it into an unrelated fixture using only declared exports and dependencies.
- Build and run that fixture.
- Verify no source aliases or undeclared source files are required.
- Verify every direct dependency is exactly pinned, peer dependencies are intentional, and a frozen install matches the manifest and lockfile.
- Verify pnpm's resolver rejects newly published external direct and transitive dependencies until they are at least seven days old, fails strictly when no eligible version exists, and rejects missing publication times.
- With `trustLockfile: false`, verify the complete loaded lockfile against registry publication times and reject any younger dependency without an exact-version `minimumReleaseAgeExclude` entry containing a rationale, owner, and expiry.
- With `trustPolicy: no-downgrade`, reject weaker publication trust than earlier releases; verify every `trustPolicyExclude` entry is exact, justified, owned, and expiring.
- With `blockExoticSubdeps: true`, reject exotic transitive sources and require explicit review of any immutable direct Git or tarball dependency.
- Deny dependency lifecycle scripts by default and maintain a narrow reviewed allowlist for any package that genuinely requires one.
- Run a license-policy check and generate a machine-readable dependency inventory from the lockfile.
- Run the network-backed vulnerability audit against runtime and development dependencies, failing on unwaived high or critical advisories and reporting all lower severities for explicit triage.
- Verify every vulnerability suppression names one advisory, rationale, owner, and expiry; do not use broad package, severity, or permanent ignores.
- Generate a declaration-based API report for review, then verify package exports, declarations, CSS, source maps, third-party attribution, and tree shaking against the built artifact rather than a source-tree alias.
- Prevent imports from Setta applications through automated boundary checks.
- Verify root and package manifests remain private and contain no `publishConfig`, registry credentials, or release tasks.

## Documentation deliverables

The initial package documentation includes:

- One-sentence product description.
- Five-minute quickstart.
- Minimal uncontrolled example.
- Controlled-state example.
- Section registry reference.
- Workbench document reference.
- Host capability and read-only integration reference.
- Public controller, focus/fit/navigation, toolbar-control, overlay, smart-placement, and external-drop references.
- Searchable creation, inline naming, minimap, marquee selection, grouping, batch commands, and stacking guide.
- Recursive section containment and validation reference.
- Sorting-mode, free-move-mode, target-stability, and orientation guide.
- Locking, minimizing, fixed/content sizing, grow/scroll overflow, and resizing reference.
- Grid, snapping, appearance, per-section presentation, chrome variants, and semantic theme-token reference.
- Single- and multi-item sortable-tree reference.
- Planned detachable-window and clipboard-adapter boundary notes that do not imply initial availability.
- Persistence integration example.
- Keyboard interaction table.
- Accessibility expectations for host renderers.
- Styling and light/dark theme tokens.
- Performance guidance for large section and item counts.
- Browser support policy.
- Third-party dependency, license, seven-day release-age policy and exception process, supply-chain audit, and vulnerability-triage instructions.
- Explicit non-goals.

## Definition of done

The initial workbench package milestone is done when:

- `@setta/workspace` installs into an unrelated React application from a local workspace reference or locally packed tarball.
- It renders without Go, Python, HTTP, WebSockets, MCP, or any Setta runtime.
- It exposes a small versioned `WorkspaceDocument`.
- Consumers can register arbitrary section renderers.
- Users can configure pan and zoom gestures while scrollable host content remains usable.
- The ready-made toolbar supports zoom, reset, fit, snap, and minimap controls and accepts host-defined controls without private imports.
- Users can create through a palette or searchable context menu, receive deterministic smart placement, rename inline, and handle generic external drops through a host callback.
- Users can select by click, modifier, keyboard, or partial/full marquee; move a sibling block; and perform group, ungroup, batch lock, and batch delete operations.
- The active section renders on top transiently, while explicit stacking commands update persistent order.
- The minimap renders and navigates a populated canvas and can be hidden or placed on either side.
- Sections can contain sections recursively with no package-imposed depth limit.
- Nested children can use vertical or horizontal orientation while preserving one logical order.
- Sorting mode reorders nested siblings without reparenting.
- Free-move mode moves a section from any source depth to the canvas or any valid destination depth.
- Section target resolution remains stable near ambiguous parent-child and sibling boundaries at every supported zoom level.
- Pointer and keyboard previews resolve to the same deterministic section move plan that is committed.
- Sections can be locked against direct movement and resizing without disabling their content or implicitly locking descendants.
- Sections can be minimized and expanded without losing fixed dimensions, content-fit modes, or nested child sections.
- Each section axis can be fixed or content-sized, and manual resize or content-fit reset follows one deterministic, undoable transition.
- Containers can grow with children or retain a bounded internally scrollable child region without leaking wheel input to the canvas.
- Top-level movement and section resizing can snap to a workbench-unit grid independently of whether that grid is visible.
- Resize axes, minimums, maximums, aspect ratio, locks, and zoom are enforced consistently for pointer and keyboard resizing.
- Consumers can customize canvas, grid, section accents, tag colors, and default/compact/transparent/headerless chrome and use light, dark, or system appearance without global CSS requirements.
- Host-controlled read-only, layout-edit, structure-edit, and presentation-edit capabilities prevent unavailable package interactions while leaving host content policy explicit.
- Section state round-trips through JSON.
- Structural undo and redo work.
- A section can host a generic sortable item tree.
- Users can select one or more sibling items and reorder or nest the block by pointer and keyboard.
- Item dragging remains correct while the workbench is zoomed.
- Interactive section content remains usable while both drag systems are enabled.
- Host validation can reject a section parent-child move without corrupting state.
- Host validation can reject an item move without corrupting state.
- The playground persists and restores the complete example.
- Package boundaries, accessibility, performance, visual behavior, third-party licensing, deterministic supply-chain checks, the seven-day dependency release-age floor, no-trust-downgrade and exotic-source policies, vulnerability policy, and local packed-consumer installation are verified.
- Manifests remain private and no registry publication, remote-repository move, or release automation is part of the milestone.
- No domain-specific application or future protocol is required to explain or use the package.

## Explicit non-goals

This plan does not include:

- Python Canvas or Python execution.
- MCP Canvas, MCP clients, or MCP servers.
- Agent Canvas, coding-agent sessions, chats, approvals, or AI Follow.
- Data Canvas, file browsers, spreadsheets, charts, images, or drawings.
- Built-in native-file importing, uploading, type detection, or file-to-section mapping; the initial scope exposes only the generic external-drop boundary.
- Agent Signal Canvas or graph execution.
- A Go or Python backend.
- CLI tools.
- Authentication.
- Deployment or sharing.
- A canonical application project format.
- Compatibility with current Setta project files, frontend contracts, state shapes, or imports.
- Migrations, legacy aliases, compatibility shims, transitional adapters, dual read/write paths, or side-by-side old/new UI implementations.
- The Setta plugin system.
- Generated OpenAPI clients.
- Domain-specific Dict or Callable semantics.
- Schema-driven form generation.
- Cross-application protocols.
- Public revision-checked transactions.
- Dry-run approvals or human-readable machine-operation summaries.
- References, variants, or saved views.
- Browser pop-out windowing and copy/paste in the initial milestone; both are planned same-package follow-on modules in Phase 6.
- Generic edges, ports, or execution semantics in the initial scope.
- Side-pane systems in the initial scope.
- Absolute/freeform child positioning inside nested containers in the initial scope. Free-move mode means cross-container section movement; nested destinations still use their parent's vertical or horizontal ordered layout.
- Hiding or collapsing a section's complete descendant subtree when minimizing it in the initial scope; minimizing hides only that section's host-rendered body.
- A family of micro-packages or any registry/repository publication topology.

## Immediate next slice

The first implementation task should stop after one visible vertical slice:

1. From a clean `main`, record the source commit and create a dedicated blank-slate branch in this working directory. Before removing the application files, prepare the source-linked evidence manifest; include it while replacing the branch contents with only the minimal private package, playground, unrelated consumer fixture, documentation, exact Node/pnpm pins, new-tree hygiene configuration, rewritten `AGENTS.md`, and selected Node-based quality and supply-chain tooling. Do not create another worktree or copy the current frontend structure.
2. Define and validate the minimal recursive `WorkspaceDocument`, including titles, presentation, fixed/content dimensions, grow/scroll child layout, canonical child lists, orientation, cycle rejection, and derived parent lookup.
3. Through the documented-public-API upstream XYFlow adapter, render a pannable and zoomable canvas with the root-node projection boundary, one configurable gesture policy, host-content wheel isolation, an independently toggleable snap grid, scoped light/dark theme tokens, the default toolbar, and a host-injected control.
4. Register note and container section kinds with searchable creation metadata, then smart-place and inline-rename a note from the context menu.
5. Render a content-sized vertical growing container with two note children, one deeper horizontal container, and the empty-container affordance in an unused child container; register every visible frame in the shared geometry index without projecting the ordered descendants as independent spatial roots.
6. Reorder the note children in sorting mode, switch the populated parent to fixed scroll overflow, scroll without panning, then restore grow mode.
7. Free-move one note from the canvas into the nested container at multiple zoom levels, with snapping, cycle rejection, a stable insertion preview, and an explicit handoff from ordinary XYFlow root dragging to dnd-kit structural ownership without viewport leakage or duplicate movement.
8. Marquee-select two top-level notes through the package selection model, move them while preserving relative offsets, group and ungroup them, and verify transient active stacking plus one explicit persistent stacking command and one document change per completed gesture.
9. Resize, return to content sizing, lock, minimize, expand, recolor, and change the chrome of a note, then serialize and restore its hierarchy, orientation, size modes, overflow, lock, minimized state, title, and presentation.
10. Render and navigate the representative document through the root minimap and shared-geometry-backed `focusSection`/`fitSections` controller helpers, including a nested target and offscreen interactive focus without independent browser scrolling.
11. Verify the locally packed package in the consumer fixture, inspect its contents and public-API report, run deterministic dependency and license checks, generate the lockfile-derived dependency inventory, and run the separate registry-backed minimum-release-age, trust-downgrade, exotic-source, and vulnerability audits.
12. Complete the source-linked evidence manifest and generic executable behavior fixtures. Record the XYFlow adapter representation, geometry-index, interaction-owner, transient-projection, public-store-access, and focus/scroll outcomes; any proven missing upstream seam; the exact dnd-kit adapter and package-owned interaction-kernel boundary; license obligations; and the selected current Setta DnD, selection, smart-placement, gesture, resize/content-size, overflow, snap, lock, minimize, title, toolbar, minimap, chrome, color, and appearance behavior matrix.

Do not begin the item-tree implementation until this slice passes its package-boundary, browser, accessibility, recursive-structure, selection-root, target-stability, smart-placement, gesture-arbitration, sizing/overflow, snapping, theme-scoping, minimap, extension-surface, and coordinate-correctness checks. Horizontal reordering, every cross-depth direction, full keyboard parity, all grid patterns, complete light/dark visual coverage, external-drop integration, and every batch-movement direction remain later phase requirements even if this first slice proves only representative paths.
