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
- Do not expose **node** as the primary package concept. In this product, a section owns content,
  frame chrome, sizing, and an optional ordered or freeform child layout; calling it a node would
  imply graph, edge, port, or execution semantics that are outside the core workspace scope.
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
- Vertical and horizontal ordered layouts and freeform spatial layouts for the direct children of a
  nested section container.
- Sorting mode for reordering a nested section among ordered siblings or spatially moving it within
  its current freeform parent.
- Free-move mode for moving a section from any source depth to the top-level canvas or any valid nested destination depth.
- Orientation-aware insertion previews and freeform position previews, collision resolution, and
  keyboard movement.
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

The initial package milestone used free spatial positions only at the top level; every nested child
participated in its immediate parent's ordered vertical or horizontal layout. Phase 6 deliberately
extends that model so any container may choose ordered or freeform positioning for its direct
children. There is no compatibility reader or migration for the earlier package-private document
shape.

The two section drag modes remain interaction preferences, distinct from a parent's serialized
positioning strategy:

- **Sorting mode** never changes parent. In an ordered parent it changes sibling order; on the
  top-level canvas or in a freeform parent it performs ordinary same-parent spatial movement.
- **Free-move mode** may change parent and depth. A drop on the canvas or in a freeform container
  produces positions in that spatial parent's coordinate system; a drop in an ordered container
  produces an orientation-aware child insertion index. It must support canvas-to-nested,
  nested-to-canvas, and nested-to-nested moves regardless of source or destination depth and
  positioning strategy.

The initial package milestone supported dragging one section or a selected sibling block. Phase 6
extends batch movement to mixed-parent normalized selection roots: when a selected section contains
another selected section, only the ancestor participates. Same-parent nested blocks preserve
logical sibling order; mixed-parent blocks use deterministic visual/hierarchy order; canvas drops
preserve measured spatial offsets. Sorting remains sibling-only, while free-move may converge a
mixed-source block into one destination atomically.

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
- `editLayout: false` prevents movement, reordering, reparenting, resizing, child positioning or
  orientation changes, stacking commands, and direct lock changes while preserving navigation and
  host-content interaction.
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
- The child-section region and its ordered vertical/horizontal or freeform spatial layout.
- Selection, focus, disabled, and resizing presentation.
- A package-owned title, optional icon slot, and inline title editor with validation, cancel, commit, and error presentation.
- Default, compact, transparent, and headerless chrome variants with an accessible drag/selection affordance even when the normal header is absent.
- Optional per-section accent and tag-color presentation using scoped semantic tokens rather than arbitrary package-global CSS.
- A content boundary that does not impose a domain layout.
- Error containment for a failing section renderer.
- Default-size metadata.
- Default size-mode, chrome, accent, and title metadata.
- Default child-positioning and ordered-orientation metadata for section kinds that accept children.
- Searchable creation metadata such as label, group, keywords, and icon.
- Public actions for changing a section's child positioning and, while ordered, its orientation
  without changing child identity or canonical order.
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
  defaultChildPositioning?: "ordered" | "freeform";
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

The exact names may change during implementation, but the boundary must remain host-rendered and
backend-neutral. Theme variables inherit into the host renderer, and the resolved light or dark
appearance is also passed explicitly so consumers can theme custom content without reading
package-internal state. Proposed defaults are resize on both axes, content sizing permitted on both
axes but fixed initially, minimizable, default chrome, not a section container, and ordered vertical
child positioning with growing overflow when containment is enabled.

Title behavior is package-owned because the frame renders it. A controlled consumer may validate or persist a proposed title asynchronously, but the editor owns keyboard behavior, Escape cancellation, focus restoration, pending state, and specific rejection presentation. A title change is one committed document change. The searchable creation UI is generated from registry metadata; consumers may hide kinds or provide additional creation items without replacing its keyboard and filtering behavior.

Chrome variants change presentation, not structural semantics. A headerless or transparent section remains selectable, keyboard reachable, draggable when unlocked, and capable of exposing its actions through selected-state chrome or an accessible floating handle. Accent and tag colors never become the only indication of selection, lock, error, or drop validity.

The package-owned frame renders the recursive child-section region adjacent to host-rendered
content. A host may style documented slots, but it cannot replace the ordered or freeform container
or its drag geometry with unrelated markup. This keeps collision detection, accessibility, and
positioning behavior consistent at every depth.

Changing an ordered orientation preserves the same logical child order. Vertical layout follows the
block axis. Horizontal layout follows the logical inline axis, so leading and trailing behavior
remains correct in right-to-left documents as well as left-to-right documents. Changing positioning
uses the explicit geometry-bearing conversion command defined for Phase 6.

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
- Switching from scroll to grow restores content participation without changing containment,
  positioning, ordered orientation, child order, or freeform positions.
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
- On drop it calls the host with `DataTransfer`, workbench position, candidate parent, and either an
  ordered insertion index or freeform local position, plus the originating browser event metadata
  required to distinguish files or application-defined MIME data.
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
  sourceParentIds: (string | null)[];
  destination:
    | {
        parentId: string;
        placement: { type: "ordered"; index: number };
      }
    | {
        parentId: string | null;
        placement: {
          type: "freeform";
          positions: Record<string, { x: number; y: number }>;
        };
      };
};

type SectionMoveDecision =
  | { allowed: true }
  | { allowed: false; reason: string };
```

The workbench accepts an optional host callback that evaluates a `SectionMovePlan` against the current document and returns a `SectionMoveDecision`. Structural checks such as cycle prevention remain package-owned; the callback is for host-specific relationships. Its rejection reason is available to visual and assistive feedback.

Required behavior:

- `sectionIds` contains one section or normalized selection roots. `sourceParentIds` aligns with
  those IDs. Same-parent nested blocks follow canonical sibling order; top-level and mixed-parent
  blocks use deterministic visual/hierarchy order.
- Sorting mode retains the existing parent. It changes only the destination index in an ordered
  parent and only local positions in a freeform parent or on the root canvas.
- Free-move mode accepts any valid source and destination depth, including an empty destination container.
- A free move to the canvas resolves one or more positions in workbench coordinates, not screen
  coordinates. A free move into a freeform container resolves positions in that container's local
  content coordinate system. Both preserve the selected block's measured relative offsets.
- A free move into an ordered container inserts the selected block in source order at one destination index.
- Moving between coordinate spaces preserves the section's visible position until the destination layout takes over.
- Moving any selected root into itself or one of its descendants is rejected before preview and commit.
- Mixed-parent free moves remove every normalized root from its exact source parent and insert the
  complete canonical block at one destination; sorting mode still requires one nested parent.
- Host policy can reject a destination without changing canonical state.
- The previewed parent and ordered index or freeform positions exactly match the committed move.
- Reparenting updates every affected canonical child list and freeform position map atomically; a
  parent lookup index is derived rather than serialized as a second source of truth.

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
  sourceParentIds: string[];
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
- Move plans contain normalized selected roots in stable canonical tree order with one aligned
  source parent per moving root.
- Multi-item dragging may converge roots from multiple parents or named lists within one mounted
  surface. The active normalized root anchors the first keyboard direction; pointer, touch, and
  subsequent keyboard previews move the complete block.
- Dragging an unselected item selects only that item. Dragging a selected item moves the normalized selected sibling block.
- Keyboard move, indent, and outdent operate on the same selection roots and commit atomically.

The first implementation supported one item tree per section and one dragged item or selected
sibling block. Phase 6 adds multiple named lists, filtered-list reconciliation, and mixed-parent
batch dragging. Cross-section item moves remain deferred.

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

type OrderedChildLayout = {
  positioning: "ordered";
  orientation: SectionOrientation;
  overflow: "grow" | "scroll";
  sectionIds: string[];
};

type FreeformChildLayout = {
  positioning: "freeform";
  overflow: "grow" | "scroll";
  positions: Record<string, { x: number; y: number }>;
  sectionIds: string[];
};

type WorkspaceDocument<TSectionData = unknown> = {
  schemaVersion: 2;
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
      childLayout: OrderedChildLayout | FreeformChildLayout | null;
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
- The order of `rootSections` defines top-level stacking order. Each nested `sectionIds` array
  defines ordered layout order or freeform back-to-front stacking and deterministic traversal order.
- Root entries use free workbench positions. Each parent explicitly discriminates ordered or
  freeform placement for its direct children; no optional-field inference is accepted.
- Root positions, nested freeform positions, and all dimension fallback values are finite numbers.
  Nested freeform coordinates are non-negative and their keys exactly match direct child IDs.
- Dimension fallback values are positive, and every size mode is supported by the registered section definition.
- A content dimension's numeric value is a stable fallback and last fixed measurement, not a promise to serialize every live `ResizeObserver` result.
- Lock and minimized states are explicit booleans rather than inferred from presentation.
- A minimized section retains the same serialized expanded size modes and values.
- Titles are non-empty after package normalization and remain independent of host payload shape.
- Chrome, accent, and tag presentation are explicit package-owned fields; valid CSS colors are parsed specifically rather than silently ignored.
- A non-null `childLayout` has a supported positioning and overflow mode even when empty. Only an
  ordered layout has an orientation; only a freeform layout has a position map.
- Scroll overflow has a bounded measured region and cannot resolve to an unbounded content-sized main axis at runtime.
- Registered section containment policy accepts every persisted parent-child relationship.
- The viewport zoom is finite and within documented bounds.
- Unknown section kinds produce a clear render error or a host-provided unknown-kind renderer.
- Parsing and validation fail specifically; malformed documents do not silently fall back to an empty workbench.

Containment has one serialized source of truth: `rootSections` plus each section's child list.
Freeform position maps describe placement but never duplicate containment. The runtime may derive
and incrementally maintain a parent lookup map, but it must not serialize a parallel `parentId` map
that can drift from those lists.

Phase 6 increments the package-private schema to version 2 and accepts only version 2. Update every
fixture and consumer directly; do not parse version 1, migrate it, retain aliases, or dual-write
both shapes.

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
- Set a section's child positioning with explicit conversion inputs.
- Change persistent root stacking order explicitly.
- Select sections.
- Set viewport.

Deleting a section removes its complete descendant subtree as one explicit, undoable structural command. Batch deletion normalizes selected roots first. The package must not silently promote descendants or leave unreachable records. Group and ungroup use the same containment invariants and never serialize a temporary duplicate parent relationship.

These commands are implementation details in the initial scope. Do not expose the broad revision-checked operation, transaction, dry-run, inverse-operation, approval-summary, or MCP-ready schema from the earlier plan.

The public change callback may include a compact reason such as `section-move` or `section-resize` for diagnostics, but it must not be presented as a stable serialized automation protocol.

### History

Built-in history covers committed changes to `WorkspaceDocument`:

- One pointer drag creates one history entry.
- One section or sibling-block reparent, sibling reorder, freeform spatial move, resize, size-mode
  change, overflow-mode change, lock change, minimize change, orientation or positioning change,
  title change, presentation change, grouping, ungrouping, persistent stacking command, or batch
  subtree deletion restores exactly on undo and redo.
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

Two upstream implementation details are decisive. In the exact pinned release, `parentId` changes
coordinate calculation, containment, expansion, and hierarchy semantics, but `NodeRenderer` still
renders every node wrapper as a sibling in one flat `.react-flow__nodes` element. A child node is
therefore not a DOM child that can naturally participate in its parent's flex layout or native
scroll/clipping region. Likewise, `onlyRenderVisibleElements` filters only entries in that XYFlow
instance's node lookup; it cannot cull recursive section frames rendered inside a node component.
The package must not claim those two upstream features cover elements that it has not projected as
XYFlow nodes.

The current Setta runtime establishes the most credible initial representation. Its XYFlow node renderer mounts only top-level spatial sections, while nested sections render recursively as ordinary ordered DOM and use dnd-kit for structure. Its marquee logic first uses measured XYFlow root nodes and then falls back to measured DOM frames for every remaining visible nested section. This is a meaningful workbench behavior, not functionality that the latest upstream XYFlow supplies automatically.

Begin Phase 0 with this architecture:

- Project each root section into one XYFlow node.
- Render descendants as package-owned recursive DOM inside their parent frame so CSS layout, grow/scroll behavior, and dnd-kit ordering remain natural.
- Register every visible root and descendant frame in one package-owned measured-geometry index expressed in workbench coordinates.
- Treat an all-sections-as-XYFlow-nodes projection or shadow-node hybrid as challenger designs only. Adopt one only if the proof shows a material advantage while preserving ordered layout, nested scrolling, all-depth selection, resize semantics, accessibility, and single-owner dragging without duplicated geometry or movement.

Phase 6 reopens that representation decision only for a freeform direct-child region because the
new capability changes the earlier proof's premises. Before broad freeform implementation, run one
bounded executable comparison of:

1. one all-sections XYFlow graph;
2. a separately provided, fixed-viewport XYFlow instance inside each freeform container; and
3. package-owned absolutely positioned recursive DOM using the existing geometry and interaction
   adapters.

Prefer upstream XYFlow whenever a candidate satisfies the complete contract through public APIs.
The proof must cover one ordered-to-freeform-to-ordered switch, arbitrary-depth mixed ordered and
freeform nesting, grow and native scroll overflow, same-parent multi-section spatial dragging,
cross-parent free movement, nested focus and marquee, culling inside both the outer viewport and an
inner scroll region, one gesture owner, and bounded store/render cost for many containers. Reject a
candidate as soon as a required invariant demonstrably fails; do not turn the proof into an
open-ended upstream audit. Record the selected owner and the concrete reasons the other candidates
failed. No XYFlow type, store, or persisted node projection may enter the public contract.

Only root sections have independent spatial positions, so the initial minimap projects roots by default. A future nested summary may consume the package geometry index, but must not present ordered descendants as independently positioned canvas roots.

The adapter must preserve these boundaries:

- `WorkspaceDocument` is the only canonical persisted model. XYFlow nodes are a derived render projection.
- Consumers import no XYFlow store, node, edge, change-event, or component-prop types through the public API.
- Prefer documented components, props, controller helpers, viewport hooks, measurement hooks, portals, and lifecycle callbacks. A documented public `useStoreApi` access is permitted only when a focused Phase 0 proof demonstrates that higher-level public APIs cannot meet a required high-frequency or imperative seam. Keep that access inside the adapter, cover the exact fields with exact-version contract tests, and never expose the store or its state shape.
- Do not import non-public source paths, copy internal modules, or make undocumented XYFlow store fields part of the implementation contract.
- Upstream marquee selection operates only on registered XYFlow nodes. The package owns all-depth marquee geometry, transient selection state, normalized selection roots, and the combined selection outline and hit area. Upstream selection behavior may be reused for projected roots only when it produces the same package outcomes.
- Upstream visible-element rendering applies only to nodes in the selected XYFlow projection. The
  existing all-depth culling owner remains responsible for recursive DOM frames, exact retained
  geometry, focus/activity pinning, and controller-driven ancestry reveal. If the Phase 6 proof
  projects freeform children into XYFlow, it must assign each frame to exactly one culling owner;
  do not enable overlapping upstream and package windowing for the same frame.
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

Status: **complete; phase audit complete** (updated 2026-08-08).

- Completed: dedicated blank-slate branch from recorded source commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; minimal private workspace, package, Node-only playground, unrelated consumer fixture, exact toolchain pins, new-tree hygiene files, package-specific repository instructions, baseline deterministic quality/packaging/supply-chain tooling, and initial source-linked interaction evidence.
- Completed: reviewable tooling carryover inventory plus negative-tested repository-tree, application-import, source-escape, and undeclared-package-export boundary enforcement wired into changed-file quality checks.
- Completed: framework-neutral, source-linked interaction fixtures for scaled geometry, combined selection bounds, selection-root normalization, canonical sibling-block order, collision ranking and hysteresis, nested target promotion, stale-target clearing, vertical and horizontal transform-stable previews, deterministic sort/free move planning and immutable application, and single-owner arbitration across pointer, touch, and keyboard activation.
- Completed: exact-pinned `@xyflow/react@12.11.2` and `@dnd-kit/react@0.5.0`; documented-public-API adapters with no XYFlow store access or upstream declaration leakage; root-node/recursive-DOM representation; one incremental all-depth geometry index; adapter-local transient root projection; explicit optimistic-sorting decision; and focused Node-only browser evidence for zoom-aligned nested selection, resizing, focus/scroll isolation, keyboard cancellation, pointer handoff, transient lift, one-command completion, accessibility, reduced motion, and 320-pixel reflow. The declaration-only `@xyflow/system@0.0.79` patch has an exact scope, owner, expiry, upstream contribution path, and removal condition in the evidence.
- Completed: positive-area partial/full all-depth marquee queries, measured selection-root normalization, readiness-aware bounds, measurement-gated initial fit, combined deep-selection overlays aligned at 0.5x/1x/2x zoom, a keyboard-reachable selection alternative, and the first repeatable non-gating 2,000-frame shared-geometry performance baseline.
- Completed: upstream-adapter selection-block drag proof for sorting and free-move modes, single and sibling-block movement, nested insertion boundaries, source/destination placeholders, blank-canvas drops, and preview/commit parity at 0.5x/1x/2x zoom. Pointer, trusted keyboard, and trusted long-press touch paths retain one structural movement owner, preserve the mode captured at activation, respect upstream scroll-consumed keyboard events, and emit at most one accepted package command.
- Completed: final interaction-owner and section-DnD matrix audit with exhaustive pointer/touch/keyboard surface ownership and no residual Phase 0 behavior cells; one adapter-local viewport/DOM measurement registry replacing per-frame recursive viewport subscriptions; and a trusted-browser render baseline covering 96-step structural movement, 96-step live XYFlow root movement, and a 96-event viewport burst with no recursive-root rerenders during transient work.
- Completed: the updated frozen lockfile passed strict loaded-lockfile policy, exact patch metadata, high/critical vulnerability audit, dependency-license allowlist, machine-readable inventory generation, and an unrelated packed-consumer installation.
- Completed: source-linked, executable non-DnD characterization for locking, minimizing, fixed/content sizing, group overflow, snapping, grid, viewport gestures, scroll isolation, stacking, placement, naming, selection, grouping, minimap, toolbar, chrome, accents/tags, and scoped appearance; a full historical/current/future browser matrix; and an explicit list of package-owned types.
- Completed: geometry-index-only section collision rectangles and target planning, a shared nested external-drop coordinate/target helper proven at 0.5x/1x/2x, synchronous gesture-start measurement readiness, explicit focus restoration and 200% page-scale browser checks, and the final repository-actionable Phase 0 gate audit.
- Phase-audit correction: final completion now re-resolves geometry and accepts only the displayed preview key; invalid targets clear retained collision state; same-root spatial moves preserve persistent stacking; Shift-click remains additive selection; every root depth has a focus target; close-ported collision/sorting kernels retain exact provenance and an MIT notice; source symbols and destinations are executable manifest data; the API report follows the public declaration closure; lifecycle allowlists are empty; and plan-loop paths are canonically repository-contained.
- Supervision correction: the transient projection now invokes a host-supplied accepted-command callback exactly once for a completed move or resize and zero times for cancellation/no-op. Phase 0 history evidence records that real callback instead of relabeling a returned command in test-local state; viewport completion remains non-undoable.
- Audit verification: exact Node 24.18.1 and pnpm 11.19.0 `quality:all` passed for 106 project files with 89 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, builds, notice-aware tarball allowlisting, and the full declaration-closure API report. Full Chromium Playwright passed 13/13 workflows and both visual baselines; the unrelated packed consumer built; and the registry-backed supply-chain gate passed with no known vulnerabilities.
- Verification: exact-toolchain changed-file quality passed 87 unit tests plus boundary/automation tests, strict types, formatting, lint, dead-code, complexity/file-length, build, pack, and API gates. Focused Chromium passed pointer cancel/complete, keyboard and touch sorting, canvas-drop parity at 0.5x/1x/2x, focus restoration, and the 200% page-scale workflow. No dependency input changed, so prior green registry and unrelated-consumer gates were not duplicated.
- Phase disposition: the Phase 0 audit is complete; Phase 1's current implementation and audit status is tracked in its section below. The external release gate below remains independent of those implementation statuses.
- External release gate (recorded 2026-08-08): interactive CDP visual review could not run because the browser runtime reported no connected browser surface. Do not retry it during routine implementation; repository Playwright remains the available browser evidence until a final audit environment provides CDP.

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

Status: **implementation complete; restarted phase audit complete** (updated 2026-08-08).

- Architecture correction completed: the former 999-line `core.ts` is now a 66-line explicit public entry surface over cohesive document-contract, document-validation and serialization, document-traversal, capability/gesture-policy, and shared surface-contract modules. Validation and canonical serialization remain single-owned, all 54 existing public exports remain present, and the five emitted internal modules are enumerated in the exact package-artifact allowlist. No behavior, compatibility path, alternate canvas model, or Phase 2 interaction was added.
- Architecture correction verification: exact Node 24.18.1 and pnpm 11.19.0 passed 65 focused core, state, and gesture-policy unit tests and changed-file quality for eight project files with 203 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code and file-length checks, package and playground builds, exact tarball contents, and the declaration-closure API report. The unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and no browser or CDP visual rerun was needed for this framework-neutral source-shape-only correction.
- Current restarted phase-audit correction: strict document and runtime validation rejects accessor-backed fields and array entries without evaluating them, including intact controller viewport arguments before cloning or publication. Controlled-host rejection and later viewport supersession settle measured navigation without stale focus, and the controller remains unavailable until the upstream viewport initializes. Initial registrations and later geometry work coalesce around one shared canvas read per pass; only a small toolbar observer subscribes to transient viewport movement; the minimap toggle retains a mounted ARIA target while hidden; and transformed host overlays size against their workspace container. The correction is committed in `75a65c6d8689c8d2a92975c0ffb882b481031228` and the focused complexity refactor in `5c9ab6a2ad5d5c12d9256beada8dc4ba0822a8b3`. No Phase 2 work is included.
- Current restarted phase-audit verification: after the first authorized broad attempt stopped before tests and builds at one complexity threshold, the narrow single-file lint workflow passed and the final `quality:all` rerun passed for 139 project files with 211 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length checks, package/playground builds, exact tarball contents, and the declaration-closure API report. Full Chromium Playwright passed 21/21 workflows and every visual baseline, including rejected controlled measured navigation, Axe, 200% page scale, 320-pixel reflow, reduced motion, RTL, and lifecycle cleanup. The unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated; the recorded unavailable external CDP release gate was not retried. The expanded audit range and gate record are in `docs/evidence/phase-1-gate-audit.md`.

- Completed: the minimal versioned recursive `WorkspaceDocument`, strict JSON parsing and validation, canonical root and child placement, derived parent lookup, deterministic traversal, arbitrary-depth mixed-orientation round trips, and specific failures for malformed structure, values, sizing, presentation, viewport, and containment.
- Completed: mutually exclusive controlled and uncontrolled React ownership; a stable public controller backed by one internal command reducer; live granular capability and `readOnly` resolution; viewport navigation that remains available in read-only mode; capability-gated lock, subtree deletion, and minimize commands representing layout, structure, and presentation edits; compact change reasons; no-op suppression; and an in-memory testing host.
- Completed: the production upstream XYFlow canvas adapter with package-owned root projection and no upstream public types; runtime-validated pan-on-drag, pan-on-scroll direction and speed, wheel, pinch, double-click, zoom-bound, and temporary activation-key policy; unique multi-instance canvas IDs; adapter-local root measurement events; a transient viewport lifecycle that retains the accepted pre-wheel baseline and publishes once at completion; canonical controller-to-canvas viewport synchronization; and independently configurable host pan/wheel suppression through `WorkspaceInteractionBoundary` without consumer knowledge of internal marker classes.
- Completed: one production DOM-measurement registry shared with the upstream proof; replacement-safe visible-root registration and cleanup; coalesced resize, nested-scroll, window, document-projection, and live-viewport remeasurement into the all-depth geometry index; geometry-backed client/workbench conversion; measurement-gated `focusSection`, `fitSection`, and `fitSections`; deterministic spatial root plus canonical descendant next/previous traversal; focus with scroll prevention; and programmatic viewport synchronization that resolves after XYFlow applies the canonical viewport without entering the user-gesture publication lifecycle.
- Completed: validated package-owned grid and appearance preferences; independently controlled grid visibility and snapping over shared two-axis workbench spacing; dot, line, and cross marks with configurable zoom-scaled mark size and pan/zoom phase at negative coordinates; shared negative-coordinate point-snap math for later movement and resize owners; scoped explicit and live-system appearance resolution; gamut-safe OKLCH light/dark defaults; documented semantic token overrides and resolved `color-scheme`; and no document, viewport, host-renderer, global class, or document-element mutation during appearance changes.
- Completed: a ready-made viewport toolbar with zoom, reset, fit, snap, and minimap controls; typed host-control placements and fixed or transformed overlay slots that receive only the public controller; runtime validation, deterministic ordering, controlled and uncontrolled snap and minimap preferences, and cleanup when extensions are removed; command-boundary zoom that remains synchronized through rapid input; roving keyboard focus, dismissible visual tooltips, coarse-pointer targets, reduced motion, logical RTL placement, and narrow-canvas group wrapping; plus an empty root-projection minimap shell with left or right placement and synchronized viewport masking.
- Completed: the phase-closing gesture and lifecycle matrix across free, horizontal, and vertical wheel panning; runtime speed changes; ordinary and activation-key wheel zoom; minimum and maximum zoom; pinch and double-click policy; disabled, primary, middle, and combined drag-button policy; temporary keyboard panning; and independent host-content pan and wheel arbitration. Canvas detachment now cancels transient viewport publication, releases geometry observers, persistent canvas/window/document listeners, scheduled frames, registered measurements, and pending index subscriptions, while Strict Mode-style reattachment and a later controlled remount restore the accepted viewport exactly.
- Phase-audit correction: the production adapter now uses only the documented public viewport hook for grid zoom, limits built-in fit to Phase 1's visible root projection, and re-synchronizes a rejected controlled gesture to the unchanged canonical viewport. Runtime accessible names reject blank values; arbitrary empty-state markup has valid interactive and gesture-isolated containment; detached playground navigation is disabled; and the retained drag proof waits for initial-fit readiness and settles auto-scroll after pointer activation. The complete record is `docs/evidence/phase-1-gate-audit.md`.
- Post-audit architecture correction: the complete toolbar implementation now lives in a focused internal module, leaving the production canvas adapter at 549 lines with useful Phase 2 headroom after final-audit wiring. Native buttons, accessible names and states, roving vertical-toolbar keyboard behavior, tooltips, ordering, and the public controller boundary remain unchanged. Toolbar zoom receives live canvas bounds from the adapter-owned geometry service instead of querying the ambient global document, so each mounted canvas retains its own owner-document geometry. Interaction-boundary class ownership and exact packed-artifact expectations now follow the extracted modules.
- Final restarted phase-audit correction: strict document and runtime validation now rejects hidden, symbol, sparse, extra, null, and unknown fields before serialization, geometry, or publication; legal prototype-mutator section IDs survive structural commands; controller viewports honor live configured bounds; malformed controller, fit, ownership, capability, gesture, grid, appearance, minimap, toolbar, navigation, and parent-lookup inputs fail specifically; and rejected controlled toolbar proposals cannot compound into a later accepted command. Keyboard focus remains visibly outlined inside clipped section nodes, while empty and viewport overlays retain logical centering in RTL. The expanded audit range and complete record are in `docs/evidence/phase-1-gate-audit.md`.
- Post-audit correction verification: exact-toolchain changed-file quality passed with 182 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, builds, exact tarball contents, and the declaration-closure API report. Seventeen focused React-surface and geometry-service unit tests passed. The directly affected Chromium toolbar workflow passed its native-control, naming/state, roving-focus, tooltip, ordering, rapid-zoom, geometry-owned-bounds regression, extension cleanup, RTL, Axe, and inspected visual-baseline checks; the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Audit verification: exact Node 24.18.1 and pnpm 11.19.0 `quality:all` passed for 129 project files with 182 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, builds, exact tarball contents, and the declaration-closure API report. After one retained adapter-proof readiness/auto-scroll assertion was hardened through its focused workflow, final full Chromium Playwright passed 21/21 workflows and all visual baselines; the unrelated packed consumer built. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 15 project files with 124 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, file-length, builds, exact tarball contents, and the declaration-based API report. The unrelated packed consumer built successfully. The focused Chromium state-contract workflow passes controlled/uncontrolled publication, runtime capability changes without remounting host content, three-category read-only rejection, retained viewport navigation, one callback per accepted command, 320-pixel reflow, keyboard-scrollable debug output, and automated accessibility scanning. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated.
- Verification: exact-toolchain changed-file quality passed for 20 project files with 146 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, file-length, package and playground builds, exact tarball contents, and a declaration report with no XYFlow contracts. The unrelated packed consumer built from the tarball. Focused Chromium passed all six directly affected playground workflows: one-change wheel publication, zero-change host scrolling, runtime gesture-policy updates without host-input remounting, controller reset synchronization, controlled/uncontrolled state, 200% page scale, automated accessibility scans, reduced motion, and both inspected 320-pixel visual baselines. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated.
- Verification: exact-toolchain changed-file quality passed for 21 project files with 150 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code and file-length checks, package and playground builds, exact tarball contents, and the reviewed declaration report with no upstream contracts in the public core surface. The unrelated packed consumer built from the tarball. Three focused production-canvas Chromium workflows and the directly affected nested-geometry proof passed frame registration/removal, one-change focus and fit synchronization, spatial next/previous navigation, 200% page scale without browser-scroll divergence, automated accessibility scanning, reduced motion, 320-pixel reflow, and both inspected visual baselines. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated.
- Verification: exact-toolchain focused unit coverage passed 30 grid, appearance, React-surface, projection, and viewport tests, including automated sRGB gamut, APCA, and WCAG compatibility assertions for both default appearances. Four directly affected Chromium workflows passed independent hidden-grid snapping, every grid pattern, negative pan and 1.5x zoom alignment, live system and explicit appearance, host token overrides without remounting host input, no global-root mutation, host-wheel isolation, geometry navigation, reduced motion, 320-pixel reflow, and automated accessibility scans. The new dark-grid, navigation-fit, and updated mobile baselines were visually inspected. Changed-file quality passed for 17 project files with 166 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code and file-length checks, package and playground builds, exact tarball contents, and the declaration API report; the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated.
- Verification: 12 focused React-surface unit tests passed descriptor and slot validation, built-in and host-control ordering, state, controller-only rendering, and static output. The directly affected Chromium toolbar/minimap, 320-pixel canvas, blank-workspace reflow, geometry-navigation, and dark-grid workflows passed rapid zoom bounds and synchronization, keyboard ordering and focus restoration, tooltip dismissal, controlled preference publication, extension and minimap cleanup, host-state retention, RTL placement, reduced motion, automated accessibility scans, and inspected visual baselines. Exact-toolchain changed-file quality passed for 19 project files with 168 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code and file-length checks, package and playground builds, dependency policy, exact tarball contents, and the declaration API report; the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated.
- Verification: 30 focused canvas, gesture-policy, viewport-lifecycle, and geometry-service unit tests passed. Five directly affected Chromium workflows passed the complete runtime gesture matrix, one-change viewport publication, host-input isolation and opt-in canvas handling, interrupted-gesture teardown, listener/observer/subscription return to baseline, exact remount restoration, toolbar and extension cleanup, automated accessibility scanning, 320-pixel reflow, reduced motion, and the inspected updated mobile baseline. Exact-toolchain changed-file quality passed for 15 project files with 180 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code and file-length checks, package and playground builds, dependency policy, exact tarball contents, and the declaration API report; the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated. The recorded unavailable external CDP release gate was not retried.
- Final restarted phase-audit verification: post-correction `quality:all` passed for 134 project files with 203 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Final full Chromium Playwright passed 21/21 workflows and every visual baseline; the new keyboard-focus baseline was inspected at original resolution. The unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.

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

Status: **implementation complete; phase audit complete** (updated 2026-08-08).

- Completed: a strict typed `SectionDefinition` registry with unique stable kinds, host display and creation metadata, fixed/content sizing defaults, resize constraints, containment defaults, minimization policy, and all four chrome defaults. Runtime validation rejects sparse, accessor-backed, extra, duplicate, contradictory, and document-incompatible registrations before a host renderer mounts.
- Completed: populated canonical roots now resolve through the registry into a package-owned accessible section frame instead of a placeholder shell. The frame uses visible-title naming, renders unrelated host components with section data plus resolved appearance and read-only context, automatically isolates host pointer and wheel interaction from the viewport, preserves a focus target for headerless chrome, exposes persistent lock/minimized state textually, and omits the host body while minimized. Root projection remains adapter-local and does not expose XYFlow contracts or make ordered descendants spatial nodes.
- Completed: top-level roots now expose a native named movement handle with 40-pixel desktop and 44-pixel coarse-pointer targets. XYFlow owns only the live pointer transform; a production `TransientRootProjection` keeps canonical positions unchanged until release, applies one accepted `section-move` command, and cancels without a write on canvas teardown. Arrow keys on the same handle move to the next grid line when snapping is enabled or by 10 workbench units when it is disabled. Position-and-size locks and live `editLayout` capability disable the affordance, the active root receives a transient lift without persistent restacking, and controlled-host rejection reconciles to canonical geometry before announcing the outcome.
- Completed: selection is now package-owned transient state with canonical document-order reconciliation, native named pressed controls, frame and Shift-toggle interaction, Control/Command+A, Escape and blank-pane clearing, plus public controller select/read/clear methods. Shift-marquee uses the shared workbench geometry at any viewport transform and supports strict `partial` or `full` matching; a viewport-portal overlay outlines normalized measured roots without allowing XYFlow registered-node selection to become a second authority. Focus navigation selects its target, assistive announcements report selection state, and a selected top-level block moves once by pointer or keyboard while preserving relative offsets. Any locked root rejects movement for the complete block without changing selection or the document, and the active block receives only a transient render lift.
- Completed: section frames now own trimmed inline title editing with native form semantics, asynchronous host validation, cancellable pending work, specific rejection presentation, and trigger-focus restoration. The same selected-state controls expose default, compact, transparent, and headerless chrome plus resettable accent and tag palettes; focus or pointer preview remains transient, tags retain a textual cue, and accent presentation cannot replace independent selection, focus, lock, invalid, or movement state. Live presentation capability gates every entry point, while accepted title and style edits each publish exactly one canonical controller change.
- Architecture correction completed: the production canvas adapter is now a 282-line orchestration surface, down from 946 lines and well below its 700-line target. Focused internal owners now contain root projection and movement, package selection and shortcuts, viewport gesture lifecycle, and canvas decorations; each extracted file remains below 400 lines. The public surface, canonical command boundary, XYFlow containment, geometry ownership, and existing movement, selection, viewport, toolbar, minimap, grid, overlay, and presentation behavior remain unchanged, and the exact package-artifact allowlist includes every emitted owner. Focused browser verification also exposed a preceding presentation-slice accessibility regression and three stale visual expectations: active scrollable host content now joins the natural keyboard order under the existing visible focus treatment, its static regression assertion is retained, and only the selected/focused-frame baselines were refreshed. No resize, creation, history, or other Phase 2 feature was added.
- Narrow-frame correction completed: every section frame now establishes its own inline-size query boundary. Below the point where four package controls and a readable heading no longer fit together, the heading and action group become two ordered rows instead of squeezing ordinary words into one-character columns; headings balance normal wrapping and reserve forced breaks for genuinely long tokens. The controls retain their DOM order, names, focus treatment, target sizes, and logical-direction layout, and the fixed-size scrollable body remains keyboard reachable.
- Narrow-frame verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passed for five project files with 246 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Three directly affected Chromium workflows passed pointer and keyboard root movement, selected-block movement, measured navigation, Axe, and the corrected selected/focused-frame baselines. All three baselines were inspected at original resolution and retain readable titles, stable action rows, visible focus, host content, selection bounds, and populated minimap state. The unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Architecture correction verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passed for 11 project files with 246 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. One hundred one focused canvas, viewport, projection, selection, movement, geometry, state, and React-surface unit tests passed. Six directly affected Chromium workflows passed root and selected-block movement at 0.5x, 1x, and 2x zoom, keyboard movement, full-containment marquee, select-all and clearing, viewport publication and host-input isolation, toolbar/minimap composition and cleanup, measured navigation without browser scroll, Axe scans, and three inspected visual baselines. The unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 22 project files with 221 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The unrelated packed consumer built successfully. Three directly affected Chromium workflows passed real host rendering, resolved read-only updates, input continuity, measured focus/fit navigation, 200% page scale, automated accessibility scans, and both inspected updated visual baselines. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Movement verification: after the first changed-file quality attempt stopped at the playground spec's file-length ceiling, the focused movement workflow was extracted without changing its assertions. Final exact-toolchain changed-file quality passed for 23 project files with 227 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Forty-one focused movement, projection, command, and React-surface unit tests passed. The directly affected Chromium movement and controlled-state workflows passed pointer projection at 0.5x, 1x, and 2x, keyboard snapping on and off, one canonical change per interaction, unchanged viewport state, live capability updates, controlled rejection reconciliation, focus retention, touch-target sizing, and Axe scans. The navigation workflow also passed after its two updated section-frame baselines were inspected at original resolution, and the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Selection verification: final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 22 project files with 234 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Fifty-six focused selection, geometry, navigation, projection, root-movement, and React-surface unit tests passed. Four directly affected Chromium workflows passed native control and frame selection, modifier toggles, full-containment marquee, select-all, Escape and pane clearing, focus-driven selection, one block commit with preserved offsets at 0.5x, 1x, and 2x, existing single-root movement, 200% page scale, focus retention, target sizing, and Axe scans. The new selected-block baseline and two focus/navigation baselines were inspected at original resolution, and the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Title and presentation verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 20 project files with 246 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Forty-four focused command, palette, and React-surface tests passed. Two directly affected Chromium workflows passed empty, rejected, accepted, and cancelled asynchronous titles; cancellation during pending validation; focus restoration; transient color preview; every chrome mode; resettable accents and tags; live capability revocation; light/dark Axe scans; reduced motion; coarse-pointer targets; 200% page scale; and 320-pixel reflow. The presentation baseline was inspected at original resolution, and the unrelated packed consumer built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Completed: registry creation metadata now drives a built-in searchable section palette and canvas context menu without exposing internal registry or XYFlow contracts. A strict host factory owns only the stable ID and serializable data while the package applies registered title, presentation, sizing, containment, and default-size metadata through the public `createSection` controller command. Toolbar, pointer-context, Shift+F10, and Context Menu key entry points share native dialog semantics, query filtering, empty results, cancellation focus restoration, and live capability gating. Explicit pointer positions win; otherwise a pure deterministic placement helper uses measured root rectangles, grid alignment, and chrome-safe visible bounds before returning an adjacent fallback and pan target. Accepted creation publishes one canonical `section-create` change, selects and transiently raises the new root, and transfers focus after its measured frame registers.
- Creation verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 31 project files with 258 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The unrelated packed consumer installed and built successfully from the tarball. Seven directly affected Chromium workflows passed searchable toolbar and context creation, pointer-exact and keyboard fallback placement, grid-aligned visible non-overlap, single-change publication, selection and deferred focus handoff, cancellation restoration, empty search, Axe scans, dark appearance, reduced motion, and 320-pixel reflow. The new creation, narrow blank-workspace, and presentation baselines were inspected at original resolution; the presentation workflow caught and verified a chrome-safe placement correction. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- React-surface architecture correction completed: the former 881-line public `react.tsx` entry is now a 72-line export and interaction-boundary surface. Public prop and extension contracts plus their runtime validation live in a 380-line owner, React preference and appearance lifecycle lives in a 105-line owner, and the complete workspace composition lives in a 380-line owner. Internal canvas consumers now import public contract types from their authoritative owner rather than cycling through the public entry, every prior public export remains present, and the exact package-artifact allowlist includes all three emitted modules. No behavior, compatibility path, or additional Phase 2 feature was added.
- React-surface architecture verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for eight project files with 258 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Forty-three focused React, creation, navigation, and geometry tests passed; the unrelated packed consumer installed and built successfully; and all three directly affected Chromium creation workflows passed searchable creation, smart placement, pointer/keyboard coordinates, focus handoff, Axe, dark/reduced-motion behavior, and narrow reflow without updating a visual baseline. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Post-creation contract correction: pane context-menu events now always use their own client coordinates, while keyboard context creation remains on its explicit last-pointer-or-canvas-center path; a regression dispatches a pointer context event after deliberately seeding a different stale pointer position. Automatic smart placement also has a retained unit proof that canvas unavailability rejects before invoking the host factory, so a failed action cannot consume a host-owned ID or trigger factory side effects.
- Post-creation correction verification: exact-toolchain changed-file quality passed for four project files with 259 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, builds, exact tarball contents, and the declaration-closure API report. The focused pointer/keyboard context-creation Chromium workflow passed the deliberately stale-pointer regression and unchanged keyboard fallback without updating a visual baseline. No dependency input changed, so supply-chain verification was not duplicated.
- Completed: generic external browser drops now use the shared all-depth geometry index to publish exact workbench coordinates, the deepest eligible container or spatial canvas candidate, and an orientation-aware insertion index. A strict synchronous host validator supplies labeled acceptance or specific rejection before one final host callback receives the original `DataTransfer` plus snapshotted MIME, file-count, modifier, client-position, and phase metadata; the package assigns no file or domain semantics and never mutates the document on the host's behalf. Visual target outlines, visible non-color-only text, and a pre-mounted polite live region expose valid and invalid state without rerendering section frames for pointer movement. `editStructure` gates the handoff, invalid drops are consumed safely, and `WorkspaceInteractionBoundary.preventExternalDrop` lets nested host receivers opt out independently of pan and wheel isolation.
- External-drop verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 19 project files with 264 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The unrelated packed consumer imported the new public callback types, installed from the tarball, and built successfully. Two directly affected Chromium workflows passed accepted and rejected MIME data, snapshotted file metadata, exact workbench placement, candidate index handoff, host opt-out, structure-capability rejection, visible and live feedback, Axe scans, reduced motion, and 320-pixel reflow; the new valid-drop baseline was inspected at original resolution. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Post-external-drop performance correction: one external drag session now performs at most one shared all-frame measurement before using the cached geometry index for subsequent `dragover` and `drop` events. Leaving the canvas, opting out through a host boundary, completing the drop, or losing edit capability ends the session; a later re-entry starts a fresh measurement. Unmount cleanup only clears the session ref and never schedules a React state update.
- Post-external-drop correction verification: exact-toolchain changed-file quality passed with 264 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, builds, exact tarball contents, and the declaration-closure API report. Both focused Chromium external-drop workflows passed, including a browser-level regression that observes one section-frame geometry read across rejected `dragenter`, `dragover`, and `drop`; no visual baseline changed. No dependency input changed, so supply-chain verification was not duplicated.
- Completed: selected section chrome now exposes native lock/unlock and minimize/expand buttons with visible icons, explicit names, `aria-pressed` or `aria-expanded` state, a stable controlled content target, and 40-pixel desktop or 44-pixel coarse-pointer targets. Live layout and presentation capabilities gate the respective controls, `minimizable: false` omits minimization, and each accepted action publishes one existing canonical controller command. A pre-mounted polite region reports accepted, rejected, unchanged, and controlled-host-declined outcomes; focus returns after every state action, including headerless chrome subtree replacement. Minimized roots use measured compact chrome without changing serialized fixed/content modes or finite fallbacks, omit the host-rendered body behind a stable hidden target, and restore canonical expanded geometry. Narrow selected frames wrap the enlarged action set by logical rows, and state reconciliation has a focused 127-line owner; root projection remained below 400 lines for that state slice.
- Lock/minimize verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passed for 20 project files with 265 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Three focused Chromium state workflows passed keyboard lock/minimize, semantic state, focus restoration, compact-body unmount and exact expansion, live read-only gating, controlled-host rejection, headerless subtree replacement, Axe, reduced motion, coarse-pointer targets, 200% page scale, and 320-pixel reflow. Three directly affected selected/focused-frame workflows also passed; the new state baseline and four updated frame baselines were inspected at original resolution. The unrelated packed consumer installed and built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Completed: selected top-level roots now expose logical inline-end, block-end, and corner resize controls through the public XYFlow resize seam. Pointer work remains adapter-local and transient at 0.5x, 1x, and 2x zoom, then publishes one atomic canonical size-and-position command; teardown cancels without a write. Native named buttons provide grid-aware or 10-unit keyboard resizing, double-click and Enter/Space return supported axes to content sizing, manual resize deterministically promotes only affected axes to fixed sizing, and finite fallbacks survive later lock, minimize, and expand transitions. Registry axes, minimums, maximums, aspect ratio, snapping, RTL inline-end position changes, live layout capability, locks, and minimized state are enforced consistently without observer-driven document writes. The resize lifecycle lives in a focused 332-line owner while root projection remains a 464-line orchestration surface.
- Root-resize verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passed for 29 project files with 272 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The unrelated packed consumer installed and built successfully. Fifty-three focused sizing, command, transient-projection, and React-surface unit tests passed. Seven directly affected Chromium workflows passed pointer resizing and cancellation at every supported zoom, keyboard resizing with snapping on and off, fixed/content transitions on both axes without observer loops, constraint enforcement, RTL geometry, one-change publication, movement, lock/minimize restoration, selected-frame geometry, presentation editing, measured navigation, Axe, reduced motion, coarse-pointer targets, 200% page scale, and 320-pixel reflow. The new RTL resize baseline and four updated selected/focused-frame baselines were inspected at original resolution. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Post-root-resize audit correction: pointer verification now starts from an off-grid 25-unit delta and proves the same 24-unit snapped commit at 0.5x, 1x, and 2x, then disables snapping and proves an exact 13-unit commit. A controlled-host workflow rejects a keyboard resize, retains canonical document and rendered geometry, restores focus, publishes no accepted change, and reports the reconciliation. Non-applied sizing results also clear any older pending reconciliation before announcing their own outcome.
- Post-root-resize correction verification: exact-toolchain changed-file quality passed for three project files with 272 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. All three focused Chromium resizing workflows passed; no visual baseline, package API, or dependency input changed, so consumer and supply-chain gates were not duplicated.
- Completed: a package-owned selection action dialog now opens from pointer context or Shift+F10/Context Menu on section chrome, preserves native host-content context menus, and operates on canonical normalized selection roots. It exposes batch lock, unlock, subtree deletion, and four explicit persistent root-stacking actions alongside truthful disabled Group/Ungroup placeholders until the group-factory slice lands. Stable stacking planners map nested selections to distinct top-level ancestors, preserve selected order, move a block by one layer or to an edge, publish one `section-stack` change through new public controller commands, and keep ordinary selection lift transient. The modal menu provides roving keyboard focus, visible per-action disabled reasons, Axe-clean semantics, live capability updates without remounting, canvas-bounded placement and scrolling, Escape/close/backdrop dismissal, controlled-host rejection feedback, and race-safe trigger or fallback focus restoration when deletion removes the trigger.
- Selection-action verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 18 project files with 280 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Twenty-six focused selection-action, stacking, and state tests passed. Eight directly affected Chromium workflows passed batch lock/unlock/delete, every stacking direction and boundary, one canonical change per action, pointer and keyboard opening, disabled-action feedback, outside and Escape dismissal, live read-only capability changes while open, controlled-host rejection, focus restoration after trigger deletion, selection/marquee regressions, Axe, reduced motion, coarse-pointer targets, and 320-pixel reflow. The new canvas-bounded selection-action baseline was inspected at original resolution, and the unrelated packed consumer installed and built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Completed: the host can now register a strict group factory that supplies one registered container kind, stable ID, normalized title, and payload for canonical sibling grouping. Group and ungroup require both structure and layout capability, normalize selection roots, reject undersized or mixed-parent selections specifically, preserve canonical sibling and root-stack order, publish one `section-group` or `section-ungroup` change, and expose public controller commands. Top-level groups use combined measured bounds and constrained registered sizing; ungrouping promotes direct children into deterministic, separated root positions from the measured group frame while avoiding occupied roots. Accepted controlled changes select the new group or promoted children and restore focus to the resulting native selection control; declined changes retain the prior document, selection, and focus. The selection menu now enables these keyboard actions with precise discoverable reasons, and the playground registers a backend-free container/factory example.
- Grouping verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 25 project files with 289 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the expanded declaration-closure API report. Fifty-five focused grouping, selection-action, controller-state, and React-surface tests passed. Four directly affected Chromium workflows passed canonical group/ungroup order and geometry, one structural change per action, accepted controlled-state selection, keyboard and fallback-control focus restoration, the revised action announcements, live capability and controlled rejection behavior, Axe, coarse-pointer targets, and 320-pixel reflow. The enabled-action menu and new grouped-container baselines were inspected at original resolution, and the unrelated packed consumer imported the new factory type, installed, and built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Completed: the root minimap now changes from a noninteractive empty shell into a pointer-navigable projection when canonical root sections exist. Clicking open minimap space centers that exact workbench point without changing zoom, clicking a root summary selects, centers, and focuses the section through the public controller, and dragging pans live through the upstream public minimap seam before one canonical viewport publication. Stable adapter callbacks survive empty-to-populated transitions without triggering the upstream conditional-hook edge, node clicks do not also fire background navigation, and a minimap pointer gesture explicitly supersedes pending programmatic viewport synchronization. Unattributed upstream transform completion now closes the existing transient lifecycle with exact rendered/canonical parity. Direct section controls plus public focus, fit, and next/previous commands remain the keyboard navigation paths, while the interactive minimap adds visible grab, grabbing, and root-pointer cues without enabling a competing wheel-zoom owner.
- Minimap verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 13 project files with 290 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Forty-one focused canvas-lifecycle, navigation, and React-surface tests passed. Five directly affected Chromium workflows passed empty-to-populated lifecycle safety, root focus/selection, exact point centering, drag preview/commit parity, one viewport change per action, prior controller-synchronization supersession, empty-minimap behavior, gesture coalescing, teardown cancellation, the 200% page-scale keyboard path without browser scrolling, Axe, reduced motion, coarse-pointer input, and 320-pixel reflow. The populated-root minimap baseline was inspected at original resolution. A stale lifecycle-test coordinate that landed on a transformed section was replaced with its existing measured open-canvas point. No public declaration or dependency input changed, so packed-consumer and registry-backed supply-chain gates were not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Completed: package-owned in-memory structural history now records each accepted section create, delete, group, ungroup, move, resize, size-mode, lock, minimize, title, presentation, and persistent stacking command once while excluding viewport and selection changes. Undo and redo preserve the live viewport, restore recorded package selection, recover focus only when the prior focused element disappears, clear redo on an accepted branch, retain entries across controlled-host rejection, clear stacks on unrelated controlled document replacement, and honor live capability policy. The stable public controller exposes history state plus undo/redo, and scoped Control/Command+Z, Control/Command+Shift+Z, and Control/Command+Y shortcuts leave host text-editing and explicitly local shortcut surfaces untouched. Pre-mounted polite feedback reports completion, empty history, capability rejection, and controlled-host rejection.
- History verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 23 project files with 297 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the expanded declaration-closure API report. Sixty focused history, state, navigation, and React-surface unit tests passed. Two directly affected Chromium workflows passed controlled and uncontrolled acceptance, rejected controlled undo retention, viewport exclusion, undo/redo selection and focus behavior, standard keyboard parity, host-input shortcut isolation, Axe, 200% page scale, and 320-pixel reflow. The new history-action visual baseline was inspected at original resolution, and the unrelated packed consumer imported the public history contract, installed, and built successfully. No dependency input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Independent history-audit correction: accepted creation, grouping, and ungrouping selection effects now settle before the history snapshot records their resulting selection. Undo and redo capture the pre-navigation focus owner, wait one animation frame for the derived XYFlow DOM to reconcile, preserve a still-live caller or host control, and otherwise focus the restored selected section without leaving a pending request for a hidden descendant. The correction adds a repeated group/ungroup undo-redo browser path covering accepted selection and focus at every structural transition.
- Independent history-audit correction verification: exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for eight project files with 298 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Twenty-five focused history, navigation, and geometry-service unit tests passed, including focus-anchor survival, removal, unrelated-focus preservation, and canvas fallback. All three Chromium history workflows passed controlled and uncontrolled acceptance, group/ungroup selection restoration, adapter-reconciliation focus recovery, caller-control preservation, shortcut isolation, Axe, 200% page scale, and 320-pixel reflow. No visual styling, public declaration, or dependency input changed, so no new baseline, packed-consumer, or registry-backed supply-chain rerun was required.
- Completed: the backend-free playground now registers both note and status-counter kinds, restores a representative two-section example through an explicit confirmed reset, persists canonical document state locally, and persists appearance, grid visibility, and snapping through a separate versioned preference record. Progressive workspace-data controls export a validated JSON download and import only package-valid documents whose host-owned payloads match the registered renderer kind; invalid JSON, unsupported schema versions, invalid host payloads, and corrupt saved state report specific recovery instructions without replacing the last valid in-memory document. Read-only mode keeps export and preferences available while disabling host document replacement. The package itself remains storage- and file-agnostic.
- Completed: the named canvas application is now a visible-focus tab stop that declares Shift+F10 and Context Menu shortcuts, so keyboard context creation has a reachable non-section target after sections exist while selected section surfaces continue to own their distinct action menu.
- Persistence and keyboard-creation verification: after the first changed-file quality attempt stopped at three unnecessary playground-local export modifiers, focused dead-code verification passed and final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 16 project files with 298 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. Two focused Chromium persistence workflows passed confirmed reset and cancellation, note/status rendering, downloadable JSON contents, strict successful and rejected imports, last-valid-document recovery, separate preference and document restoration across reload, corrupt-storage recovery, read-only behavior, native disclosure state, focus movement, Axe, reduced motion, coarse-pointer targets, 200% page scale, and 320-pixel reflow. Three focused default scaffold workflows, three creation workflows, and two external-drop workflows passed the updated empty-state contract, both registered creation kinds, trusted Shift+F10 canvas creation, exact pointer coordinates, smart placement, focus handoff, host drop integration, Axe, reduced motion, 200% page scale, and narrow reflow. The persistence controls, empty narrow playground, expanded creation palette, and updated external-drop feedback baselines were inspected at original resolution. No dependency, lockfile, or public declaration changed, so packed-consumer and registry-backed supply-chain gates were not duplicated; deterministic dependency policy and exact package contents passed in changed-file quality, and the recorded unavailable external CDP release gate was not retried.
- Phase-audit corrections: controlled creation, title, and style proposals now wait for canonical host reconciliation before success effects; rejected creation clears deferred focus/selection before later host replacement. Top-level ungrouping preserves prototype-mutator IDs, unchanged root projections retain renderer identities across large sets, and delayed programmatic viewport completions cannot consume a superseding user gesture. The Phase 2 tests and docs now preserve nested data/sizing while leaving visible recursive children to Phase 3. Corrections are committed in `b9ea93e5f8ddd29391e35a3c5881d17bf700fbb4` and `2ce3a1ca1685efffc842e4c3611671900f0260bb`.
- Phase-audit verification: final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 209 project files with 300 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The first full Chromium run exposed the viewport supersession gap and a stale Phase 1 narrow baseline; both passed focused correction workflows. The final full invocation passed 50/51 workflows and every baseline; its sole unchanged touch-proof failure had passed in the first full invocation and passed immediately in one isolated final-tree run, so all 51 workflows have green post-relevant-change evidence without another broad retry. The corrected narrow canvas-shell baseline was inspected at original resolution. No dependency input changed, and no public declaration changed after the already-green history consumer run, so supply-chain and packed-consumer gates were not duplicated. The recorded unavailable external CDP release gate was not retried. The expanded range and complete record are in `docs/evidence/phase-2-gate-audit.md`.

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
- Preserve nested child data and fixed/content sizing metadata while minimizing a top-level container, then restore dimensions and focus; visible recursive-child retention remains Phase 3 work.
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

Status: **implementation complete; phase audit complete** (updated 2026-08-09).

- Completed (ordered items 1-5): the already-audited strict containment model, descendant checks, and derived parent lookup now drive one package-owned recursive DOM projection with no depth cutoff. Every visible root and descendant frame registers stable parent, depth, order, and workbench geometry without becoming an XYFlow spatial node; unchanged root and subtree projections retain identity. Native selection controls, nested frame clicks, Control/Command+A, full-mode marquee, focus/fit, and combined bounds now use that all-depth geometry at 0.5x, 1x, and 2x zoom. Child regions render canonical order through logical vertical and horizontal flex layout, preserve descendants when a container's host body is minimized, expose orientation/overflow state and an empty-container foundation, and isolate nested input from XYFlow root dragging while structural DnD remains disabled. Intrinsic root axes enter XYFlow at `max-content` for their first hidden measurement instead of changing from a numeric fallback inside the resize observer.
- Completed (ordered item 6): container overflow is now one deterministic `editLayout` command and history entry. Entering scroll mode captures the measured main-axis frame size before fixing that axis; returning to grow mode restores content sizing only when the registered section kind supports it, without changing containment, orientation, or child order. Scroll containers have bounded overflow, become named keyboard-scrollable regions only when browser geometry proves real overflow, and claim the XYFlow wheel boundary only in that state. The stable section-header toggle preserves focus, reports pressed and disabled state, reconciles controlled-host acceptance, and announces accepted or rejected changes. Empty containers render a visible drop affordance, and the playground proves existing host-controlled external-drop acceptance through that target without enabling the structural section DnD reserved for ordered item 8.
- Completed (ordered item 7): `setSectionChildOrientation` now exposes one public, runtime-validated controller action backed by a capability-gated `section-orientation` command and history entry. Vertical-to-horizontal and horizontal-to-vertical changes retain the same canonical child list, parent relationships, overflow mode, and unaffected size modes; a scroll container captures and fixes its newly constrained measured axis before the change so the document stays valid without guessing geometry. A native section-header control names the resulting layout, preserves focus, remains direction-logical in right-to-left documents, disables before policy-blocked interaction or a lock/minimize state that prevents required size capture, and reports accepted, rejected, unchanged, and controlled-host-rejected results through its own pre-mounted polite live region. The adjacent overflow transition was extracted into a pure command helper so the central reducer remains below its file and complexity limits without changing item 6 behavior.
- Completed (ordered item 8): one production interaction coordinator now gives root layout, structural section DnD, or viewport movement exclusive ownership and keeps capability activation separate from an in-flight owner's continuation. The public, runtime-validated `sectionMoveMode` preference defaults to sort: nested handles use dnd-kit while top-level roots retain XYFlow spatial dragging; free mode hands root and nested handles to dnd-kit. An active structural or root gesture retains its captured surface and mode across a host mode change, owner-specific completion ignores stale callbacks, and cancellation restores the ordinary activators without changing the canonical document. Structural ownership disables XYFlow node movement and event-backed viewport gestures, root ownership disables viewport and structural activation, viewport ownership disables both movement surfaces, and XYFlow node-drag auto-pan cannot become a second viewport owner. Pointer, long-press touch, and keyboard activation share the same semantic button, selected-state handoff, overlay, focus restoration, and pre-mounted package announcement; the workspace suppresses dnd-kit's duplicate accessibility plugin while the upstream proof retains its default semantics. Completion intentionally reports no document change until ordered items 9-11 add the pure plan, preview, and commit boundary.
- Completed (ordered items 9-11): one immutable, capability-gated `section-move` command now applies the existing canonical plan model to same-parent sorts and free moves from canvas to nested, nested to canvas, and nested to nested at unrelated depths. A selected sibling block remains atomic and canonical, canvas moves preserve block offsets, nested moves preserve child order, and unaffected sections, containers, root entries, and root arrays retain identity. Runtime application re-plans against the current document and rejects stale source fields, mixed parents, non-container destinations, cycles, locked moving sections, non-finite or extraneous canvas positions, and any plan that differs from the canonical result; preview identity includes every exact plan field without delimiter or coordinate-rounding collisions. The production dnd-kit boundary captures one synchronous geometry frame, resolves logical vertical, horizontal, left-to-right, and right-to-left insertion positions, renders a source outline plus canvas, empty-container, or insertion-line destination feedback through the XYFlow viewport portal, and commits only when the completion plan exactly matches the displayed plan. Accepted controlled proposals wait for the exact canonical document before success and remounted-handle focus; rejected controlled proposals retain the old document and announce rejection. Remaining ordered work begins with recursive grouping and complete keyboard movement in items 16-18.
- Completed (ordered items 12-14): structural activation now supplies dnd-kit and the package collision kernel with the selected roots' combined rectangle from the one synchronously captured geometry frame. Collision candidates are limited to intersecting measured child regions, clipped to visible region geometry, and exclude every moving root plus any destination region owned by a moving root. The session carries the characterized previous target, previous rectangle, pointer direction, midpoint, and hysteresis state across frames; sortable ranking preserves directional-trigger priority and previous-target tolerance, promotes an intersecting child above its containing parent, clears stale targets, and mirrors horizontal geometry for logical right-to-left insertion while retaining zoom-invariant outcomes at 0.5x, 1x, and 2x. Accepted same-parent and cross-parent plans now derive layout-stable CSS translations from the captured canonical order, frame sizes, logical direction, and flex gap without changing the document or DOM order during pointer movement. One imperative projection updates only previously or newly transformed frames, reapplies state across ref replacement, clears on completion, cancellation, and unmount, suppresses the obsolete source outline when a moving source is itself projected, and pauses the geometry-subscribed selection outline until structural ownership ends so transform feedback cannot produce a second drifting selection cue.
- Completed (ordered item 15): structural activation now preflights the package-owned normalized selection before dnd-kit can claim movement, so mixed-parent batches and any directly moving locked root expose disabled semantic handles and a specific description without starting an interaction. A locked descendant does not implicitly block movement of its selected ancestor, and a locked container remains a usable destination. Self and descendant regions are detected before ordinary collision ranking and render a red, non-color-only invalid target plus a visible and polite announced reason. The public, runtime-validated `validateSectionMove` callback receives the current document and an immutable snapshot of the exact canonical plan for synchronous host policy; malformed decisions fail specifically, rejected targets never become commit previews, and completion revalidates the same plan without publishing a document change. The playground and packed-consumer source exercise the public callback, while package documentation defines its side-effect-free boundary.
- Completed (ordered item 16): the existing deterministic group and ungroup commands now have production proof at arbitrary recursive depths. Grouping requires normalized siblings with one exact shared parent, preserves canonical child order, installs the new group at that same parent, and rejects mixed-parent selections without publishing a change. Ungrouping restores every child to the removed group's exact parent and position. Controlled reconciliation verifies the resulting parent as well as child order, and direct actions hand focus to the accepted group's or promoted child's native selection control after bounded dialog and XYFlow reconciliation; history recovery retains its established frame-focus convention. The playground group kind grows with nested content so recursive groups do not clip or overlap their children.
- Completed (ordered item 17): structural keyboard movement now resolves arrow input semantically while retaining dnd-kit as the sole gesture-lifecycle owner. Vertical and logical horizontal arrows select adjacent canonical sibling boundaries, including mirrored right-to-left order. In free mode, an arrow beyond the current layout resolves the nearest valid measured container boundary in that direction and promotes a valid descendant container above its colliding ancestor. Every preview uses the same normalized sibling block, immutable package plan, host validator, layout-stable projection, and exact completion revalidation as pointer and touch movement. Active arrows suppress browser scrolling; Enter or Space commits one command, Escape cancels, pre-mounted polite regions announce previews and outcomes, and the remounted native handle regains focus without scrolling.
- Completed (ordered item 18): the backend-free recursive fixture is now the explicit closing example and browser proof for a content-growing vertical root, a fixed scrolling horizontal child container, a deeper vertical container, and an interactive leaf at depth three, plus an empty sibling destination. The focused keyboard workflow exercises vertical sorting, horizontal sorting in left-to-right and right-to-left layouts, selected-sibling-block targeting across container depths, exact announcements, focus restoration, and automated accessibility against that mixed-orientation tree.
- Recursive-rendering verification through item 5: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passed for 15 project files with 303 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the new internal recursive-tree module, and the unchanged public declaration surface. Fifty-nine focused React, root-projection, selection, geometry-index, and geometry-service tests passed. Three directly affected Chromium workflows passed unbounded mixed-orientation rendering, stable subtree projection, nested frame-click and control selection, descendant marquee, combined bounds at every supported zoom, focus/fit, all-depth select-all, minimize retention, 320-pixel reflow, reduced motion, Axe, top-level group/ungroup visibility, and resize-observer error rejection; the recursive-tree and updated grouped-section baselines were inspected at original resolution.
- Ordered-item-6 verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passes for 22 project files with 308 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the new internal overflow module, and a generated API report. Focused reducer, history, static React, and root-projection tests pass for main-axis capture, stable grow restoration, policy and geometry rejection, canonical child retention, control semantics, and announcement scaffolding. The directly affected three-test Chromium recursive workflow passes native wheel isolation without outer viewport movement, grow-to-scroll size recapture without a visual jump, focus retention, undo/redo, real-overflow keyboard exposure, host-accepted empty-container drop, affordance removal, 320-pixel reflow, reduced motion, and Axe with both recursive baselines inspected at original resolution. The temporary packed unrelated consumer passes after the intentional public `section-overflow` change reason addition. No dependency input changed, so the registry-backed supply-chain gate is not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Ordered-item-7 verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passes with 312 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the two pure child-layout command helpers and orientation React owner, and the expanded declaration API report. Forty-three focused orientation, overflow, root-projection, and static React tests pass. The directly affected Chromium orientation/overflow selector passes stable scroll-axis capture, logical-order preservation through vertical, horizontal, and right-to-left layout, focus retention, undo/redo, 200% page scale, live announcements, empty-container drop, and Axe; the adjacent minimized-container selector passes 320-pixel reflow, reduced motion, descendant retention, and Axe. The updated selected-container baseline was inspected at original resolution, and the temporary packed unrelated consumer installs and builds successfully. No dependency input changed, so the registry-backed supply-chain gate is not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Ordered-item-8 verification: after the first required gate identified one unnecessarily exported internal parser, focused dead-code verification passed and final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 33 project files with 315 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including both new interaction owners, and the expanded declaration API report. The public movement-mode type now comes from the existing pure planning owner instead of restating its union; the unrelated packed consumer imports that type, installs from the tarball, and builds successfully. Eleven directly affected Chromium workflows pass exclusive root, structural, and viewport ownership; pointer, long-press touch, and keyboard activation; completion, cancellation, runtime mode changes, focus restoration, ordinary root movement, one-change viewport coalescing, disabled competing pointer and direct-keyboard activators, no viewport leakage or stale auto-pan, upstream accessibility semantics, reduced motion, 320-pixel reflow, and Axe. The recursive baseline's internal horizontal scroll is normalized before measured fit and passed three concurrent stability repeats; its updated tree, adjacent overflow, grouped-section, and mobile canvas baselines were inspected at original resolution. No dependency or lockfile input changed, so the already-green registry-backed supply-chain gate was not duplicated, and the recorded unavailable external CDP release gate was not retried.
- Ordered-items-9-11 verification: final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passes for 25 project files with 324 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the three movement owners and extracted section-input validator, and the expanded declaration API report. Focused planning and command coverage passes exact serialization, stale-plan rejection, immutable single and batch sorting, every implemented cross-depth direction, empty destinations, locked/cyclic/leaf rejection, capability gates, stable unaffected identities, orientation-aware insertion, and controlled-document matching. All ten upstream adapter workflows and all six recursive-workbench workflows have green Chromium evidence for exact preview/commit parity, selection-block geometry at every supported zoom, one movement owner, stale-preview clearing, pointer/touch/keyboard activation, sort/free runtime capture, recursive sort, nested-to-canvas and canvas-to-deep-empty movement, focus restoration, undo/redo, reduced motion, 320-pixel reflow, visual baselines, and Axe; the first combined invocation's two ambiguous host-status selectors passed one focused final-tree rerun after the preview announcer retained `aria-live="polite"` without claiming a second status role. The new movement-preview baseline was inspected at original resolution. The temporary unrelated consumer installs the locally packed artifact and builds after the intentional public rejection-reason expansion. No dependency or lockfile input changed, so the registry-backed supply-chain and vulnerability gates are not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Ordered-items-12-14 verification: final exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passes with 337 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the three new movement internals, and the unchanged public declaration surface. Forty-three focused collision, interaction-planning, and move-command tests pass selection-shaped root exclusion, previous-target and previous-rectangle retention, child promotion, stale clearing, midpoint hysteresis, right-to-left logic, collision invariance at 0.5x/1x/2x, vertical and horizontal stable transforms, cross-parent sibling-block gap closure/opening, and specific incomplete-geometry failure. The directly affected Chromium structural-preview selector passes transform-only preview with unchanged direct-child DOM order, exact commit parity, transient-transform cleanup, focus restoration, free moves to canvas and a deep empty container, undo/redo, Axe, and the regenerated movement baseline inspected at original resolution. The unrelated packed consumer installs and builds successfully. No dependency or lockfile input changed, so the registry-backed supply-chain and vulnerability gates are not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Ordered-item-15 verification: final exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passes for 24 project files with 340 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the expanded declaration API report. Focused selection and move-command coverage passes mixed-parent, normalized ancestor, locked-root, immutable-plan, strict host-decision, and malformed-decision cases. The directly affected Chromium rejection selector at 0.5x zoom passes host-policy preview and completion rejection without a document change, self/descendant rejection, mixed-parent and locked-source preflight, focus-safe cancellation, invalid non-color-only feedback, Axe, and the regenerated rejection baseline inspected at original resolution. The unrelated packed consumer imports the public validator, installs the local tarball, and builds successfully. No dependency or lockfile input changed, so the registry-backed supply-chain and vulnerability gates are not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Ordered-item-16 verification: final exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passes for 15 project files with 341 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the unchanged public declaration surface. Focused grouping and geometry-service units pass nested parent/result matching and bounded remount-safe focus handoff. Three directly affected Chromium workflows pass root and nested group/ungroup behavior, mixed-parent rejection, exact structure and selection through undo/redo, native focus restoration, polite announcements, content-growing recursive layout, reduced-motion-safe stable screenshots, and Axe. The updated root-group and new nested-group baselines were inspected at original resolution. No dependency, lockfile, or public declaration input changed, so registry-backed supply-chain, vulnerability, and packed-consumer gates are not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Ordered-items-17-18 verification: after the first required gate identified the section-frame file-length ceiling, the key-direction helper moved into its existing pure movement owner and final exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passes for 12 project files with 347 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the two new keyboard-movement owners, and the unchanged public declaration surface. Six focused keyboard planner and session tests pass vertical and right-to-left horizontal boundaries, atomic selected-sibling plans, exact host-policy rejection, descendant-target promotion, and completion revalidation. The directly affected Chromium sorting selector passes vertical and logical horizontal preview/commit in left-to-right and right-to-left layouts with one canonical change, exact announcements, and restored native-handle focus. A separate descendant-promotion selector passes selected-sibling-block targeting into the depth-three empty container, cancellation, focus restoration, and Axe. The retained full selected-block commit selector was not rerun after that promotion correction under the implementation loop's two-failure stop rule; its exact plan and completion boundaries were covered by focused units and reserved for the phase audit. No dependency, lockfile, or public declaration input changed, so registry-backed supply-chain, vulnerability, and packed-consumer gates are not duplicated, and the recorded unavailable external CDP release gate is not retried.
- Phase-audit corrections: prototype-safe records preserve every legal section ID through planning, geometry, previews, and commands; keyboard free move includes nested-to-canvas placement; keyboard activation no longer scrolls the document beneath its captured geometry; recursive history restores focus when the old frame remains mounted as a descendant; and retained visual, wheel, placement, and exact-plan tests encode their Phase 3 control, reconciliation, rendering-tolerance, and non-auto-scroll assumptions. Corrections are committed in `ac844b58184a2e4d208e3c4995acfc931c39310a`, `e9b0c52228f293cc5376bfefef3ef44ae4a7fc11`, and `363446eb0af2dce9c35382016091b1d981264ad1`.
- Phase-audit verification: final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 239 project files with 350 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The first full Chromium invocation exposed six actionable code, baseline, and test-assumption gaps; their focused correction workflows passed. The final full invocation passed 64/65 workflows and every baseline. Its sole exact-plan failure used a blank point inside dnd-kit's auto-scroll edge; the test-only inset correction passed that workflow once on the final tree, so all 65 workflows have green post-relevant-change evidence without another broad retry. Both refreshed baselines were inspected at original resolution. No dependency input changed, and no public declaration changed after the already-green ordered-item-15 consumer run, so supply-chain and packed-consumer gates were not duplicated. The recorded unavailable external CDP release gate was not retried. The expanded range and complete record are in `docs/evidence/phase-3-gate-audit.md`.

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
- Keep nested children visible and usable while their parent host body is minimized, then restore fixed dimensions exactly, resume content-fit dimensions, and restore focus.
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

Status: **implementation complete; phase audit complete** (updated 2026-08-09).

- Completed (ordered items 1-6): one public, framework-neutral sortable-item-tree kernel now validates the non-rendered root, unique non-empty IDs, exact single placement, known parents and children, reachability, and acyclic containment without recursive traversal. It derives canonical preorder and parent lookup, supports replacement and modifier-style selection, normalizes selected ancestors over descendants, preserves canonical sibling order, selects an unselected active item alone, and falls a mixed-parent selected drag back to the active item with specific feedback while retaining the broader selection. One immutable planner covers flat single and selected-sibling-block reorder, nested moves into, out of, across, and to empty parents, post-removal insertion indexes, no-op detection, self/descendant cycles, containment policy, and one synchronous boolean host `canMove` decision.
- Completed (ordered items 7-11): the public controlled React `SortableItemTree` provides handle-only pointer, touch, and keyboard movement; reorder, indent, outdent, cancel, selection, focus restoration, and live announcements; one atomic placeholder and overlay for selected sibling roots; immutable drag-start geometry for stable zoom-aware collision; and final host/tree revalidation before emitting one move plan. Nested item ownership excludes outer section dragging, canvas panning, wheel capture, and upstream auto-scroll while the item interaction owns movement, including item-to-section and section-to-item handoff. The public `applySortableItemMove` helper applies accepted plans with no-op identity preservation. The playground field-list renderer supplies real inputs, a nested group, host rejection, transient controlled selection, and payload-backed moves that round-trip without adding item state to `WorkspaceDocument`; the unrelated packed consumer imports the same public surface.
- Ordered-items-1-6 verification: exact Node 24.18.1 and pnpm 11.19.0 changed-file quality passed for nine project files with 371 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents including the four new item-tree internals, and the expanded declaration-closure API report. Twenty-one focused item-tree tests cover strict and prototype-safe validation, 2,048-level iterative traversal, modifier selection, normalized and mixed-parent drag blocks, flat and nested single/block planning, empty and cross-parent destinations, post-removal indexes, cycles, no-ops, containment, immutable host policy, and malformed callbacks. The unrelated consumer imports the new public core contract, installs the local tarball, and builds successfully. No dependency or lockfile input changed, so the registry-backed supply-chain and vulnerability gates were not duplicated; no browser or CDP verification applies to this framework-neutral batch.
- Ordered-items-7-11 verification: exact-toolchain changed-file quality passed for 38 project files: repository boundaries across 255 files, all four dependency manifests, formatting, lint, dead-code, complexity and file length, strict package/playground/root types, 35 unit files with 387 tests, six boundary tests, plan-loop automation, package/playground builds, the declaration API report, and exact packed contents including all sortable-item interaction modules. Four directly affected unit files pass 94 focused tests. The unrelated tarball-installed consumer builds, and the focused Chromium persistence selector imports, exports, resets, and restores the three-section item payload. Narrow Chromium diagnostics passed immutable selected-block pointer geometry at workbench zoom 0.5, touch reparenting, remount-safe focus restoration, and both item-to-section and section-to-item ownership handoffs; the retained three-scenario sortable-item browser suite remains the phase-audit gate because its full selectors reached the loop's repeated-failure stop rule before those focused fixes. CDP visual check: done (original-resolution Chromium keyboard-preview snapshot; atomic overlay and placeholder, selection, focus, and nested inputs inspected). No dependency or lockfile input changed, so the already-enforced local dependency policy was verified while registry-backed supply-chain and vulnerability gates were not duplicated.
- Phase-audit corrections: keyboard movement retains selected-ancestor normalization when a descendant handle is active and clears a reversed-to-origin preview without consulting host policy; active-tree unmount releases ownership; bounded focus recovery respects later user focus; local item shortcuts preserve containing-section selection; containment callbacks remain boolean and consistent with rendered descendants; imported non-group children and stale transient selection fail or reset specifically; and pointer completion uses the real final point instead of a feedback-sensitive upstream transform. Controlled pointer assertions now wait for canonical reconciliation, and the creation baseline includes the field-list entry. Corrections are committed in `b21db6d89a0356120f3d03a1cfb3dbe944d36d4a`.
- Phase-audit verification: final exact Node 24.18.1, Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 256 project files with 389 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents, and the declaration-closure API report. The first full Chromium invocation exposed three actionable pointer, reconciliation, and baseline assumptions; their exact focused workflow passed 3/3 after correction, and the final full invocation passed all 68 workflows and every visual baseline. Phase 4 changed no dependency input, and the audit did not change the consumer fixture's imported core/React contract, so registry-backed supply-chain and packed-consumer gates were not duplicated. The expanded range and complete record are in `docs/evidence/phase-4-gate-audit.md`.
- Post-audit supervision correction: an accepted nested item move now has direct Chromium proof through local persistence, reset, JSON import, and page reload. The dnd-kit adapter filters its package-owned accessibility and auto-scroll plugins by exact public class identity rather than constructor-name inference, with exact-pinned `@dnd-kit/dom@0.5.0` declared directly. Correction `4967f27aa7e06d200a70a3022c7d96512c83f17f` passed exact-toolchain `quality:all`, the unrelated packed-consumer build, the registry-backed supply-chain and vulnerability audit, and all 69 Chromium workflows.

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

Status: **complete; phase audit complete** (updated 2026-08-09).

- Completed (public API and onboarding batch): reviewed the complete generated declaration closure and all five declared package entry points; retained the section/item naming boundary without aliases; made `createEmptyWorkspaceDocument` preserve a consumer's payload type without an internal cast; added the private package description; and upgraded the packed README with local-install guidance, an entry-point map, a five-minute uncontrolled example, a controlled generic-document example, and navigable reference sections. The review and remaining Phase 5 boundary are recorded in `docs/evidence/phase-5-public-api-review.md`.
- Public API and onboarding verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 focused core/React tests passed 58 tests; changed-file quality passed for nine project files with repository/import boundaries across 257 files, all four dependency manifests, formatting, file length, strict types, dead-code analysis, 389 unit tests, six boundary tests, plan-loop automation, builds, exact tarball contents, and the regenerated 36-file declaration report. The unrelated tarball-installed consumer builds with the root runtime entry point plus direct core, React-type, and CSS subpaths. No dependency version or lockfile input changed, so registry-backed release-age, trust, and vulnerability checks were not duplicated; no rendered UI or styling changed, so browser and CDP visual verification do not apply.
- Completed (developer-guide batch): added a task-oriented index and six focused guides for host integration; recursive sections, structural movement, and frame layout; sortable item trees; theming; accessibility and keyboard interaction; and verification, performance, and support policy. The private packed artifact now includes the complete guide set, and its exact allowlist verifies that every local Markdown link resolves inside the package. The contract review and remaining Phase 5 boundary are recorded in `docs/evidence/phase-5-developer-guides.md`.
- Developer-guide verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passed for 12 project files with repository/import boundaries across 265 files, all four dependency manifests, formatting, file length, strict package/playground/root types, dead-code analysis, 389 unit tests across 35 files, six boundary tests, plan-loop automation, package/playground builds, exact packed contents including all seven guide files and local-link validation, and the regenerated declaration report. No runtime component or CSS changed, so browser and CDP visual verification do not apply. No dependency version or lockfile input changed, so the registry-backed supply-chain and vulnerability gate was not duplicated.
- Completed (milestone performance-report batch): added one repeatable built-artifact benchmark for a 1,024-section recursive document, 512-section sibling lists, a 64-section selected block, 256 collision candidates, 80 smart-placement rectangles, a 2,000-item sibling list, and a 2,048-level item tree. The append-only Phase 5 report combines those deterministic checksums and observed totals with the existing shared-geometry, render-count, zoom, recursive-layout, item, appearance, and lifecycle evidence; it retains structural budgets and records viewport culling and cross-machine elapsed-time gates as explicit limits rather than inventing thresholds.
- Milestone performance-report verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 produced the repeatable suite checksum `146531890` from the built public artifact. Changed-file quality passed for six project files with repository/import boundaries across 267 files, all four dependency manifests, formatting, lint, file length, strict package/playground/root types, dead-code analysis, 389 unit tests across 35 files, six boundary tests, plan-loop automation, package/playground builds, exact packed contents, and the regenerated declaration report. No package runtime, CSS, public declaration, dependency version, or lockfile input changed, so browser/CDP visual, packed-consumer, registry-backed release-age/trust, and vulnerability gates were not duplicated; the recorded unavailable external CDP release gate was not retried.
- Completed (milestone gate-audit batch): the unrelated tarball consumer now registers and renders typed note/container definitions from a non-empty document, retains the public item-tree and extension contracts, and runs a headless Chromium smoke that creates and renames through package UI after its strict build. The packaged guide index now describes the completed private milestone without inventing a public compatibility promise. Final Chromium trace review also moved the retained touch-owner proof away from an active auto-scroll edge so it tests stable completion rather than correctly rejected stale-preview behavior. The complete record is `docs/evidence/phase-5-gate-audit.md`.
- Phase-audit verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 `quality:all` passed for 268 project files with 389 unit tests, six boundary tests, plan-loop automation, strict types, formatting, lint, dead-code, complexity/file-length, package/playground builds, exact tarball contents and documentation links, and the 36-file declaration report; final changed-file quality passed for the eight-file audit batch and resulting 268-file boundary. The milestone and geometry performance checks reproduced checksum `146531890` and the 2,000-frame profile. The broad Chromium run passed 68/69 workflows; its sole trace-proven touch-test auto-scroll race passed in the exact focused selector after the relevant test correction, giving all 69 workflows and every visual baseline green final-tree or post-relevant-change evidence without duplicating the broad matrix. The packed consumer build/runtime smoke and registry-backed supply-chain, license, inventory, and vulnerability audit passed with no known vulnerabilities. The earlier unavailable connected-browser release gate was not retried; original-resolution Chromium baselines were inspected. CDP visual check: done (recursive movement, sortable-item feedback, presentation editing, and dark grid/toolbar baselines inspected).

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

Status: **implementation complete; independent phase re-audit required** (updated 2026-08-09). The detachable-section, adapter-driven clipboard,
optional outline-navigator, top-level auto-layout, named item-list, filtered item-list,
mixed-parent batch-movement, saved viewport-preset, generic edge-and-port, pane-registration, and
viewport-culling batches are implemented. They are recorded in
[Phase 6 detachable-section evidence](../evidence/phase-6-detachable-sections.md) and
[Phase 6 clipboard evidence](../evidence/phase-6-clipboard.md), with the navigator record in
[Phase 6 outline-navigator evidence](../evidence/phase-6-outline-navigator.md) and the layout record
in [Phase 6 top-level auto-layout evidence](../evidence/phase-6-auto-layout.md). The named-list record
is [Phase 6 named item-list evidence](../evidence/phase-6-named-item-lists.md), with the filtered
projection record in [Phase 6 filtered item-list evidence](../evidence/phase-6-filtered-item-lists.md)
and the mixed-parent record in
[Phase 6 mixed-parent batch-movement evidence](../evidence/phase-6-mixed-parent-batch-movement.md).
The saved-view record is
[Phase 6 viewport-preset evidence](../evidence/phase-6-viewport-presets.md), and the connection
record is [Phase 6 generic edge and port evidence](../evidence/phase-6-generic-connections.md). Pane
registration is recorded in
[Phase 6 pane-registration evidence](../evidence/phase-6-pane-registration.md), and browser
windowing is recorded in
[Phase 6 viewport-culling evidence](../evidence/phase-6-viewport-culling.md). The bounded
nested-freeform representation prerequisite is recorded in
[Phase 6 nested-freeform representation evidence](../evidence/phase-6-nested-freeform-representation.md).
The schema-v2 document and static recursive-projection foundation is recorded in
[Phase 6 nested-freeform document-contract evidence](../evidence/phase-6-nested-freeform-document-contract.md).
Same-parent freeform movement and the local-coordinate target/application contract are recorded in
[Phase 6 nested-freeform local-movement evidence](../evidence/phase-6-nested-freeform-local-movement.md).
Interactive cross-parent target resolution and coordinate conversion are recorded in
[Phase 6 nested-freeform cross-parent movement evidence](../evidence/phase-6-nested-freeform-cross-parent-movement.md).
Freeform-aware grouping and ungrouping are recorded in
[Phase 6 nested-freeform grouping evidence](../evidence/phase-6-nested-freeform-grouping.md).
Clipboard and external-drop placement are recorded in
[Phase 6 nested-freeform placement evidence](../evidence/phase-6-nested-freeform-placement.md). The
named production positioning control and integrated performance/browser matrix are recorded in
[Phase 6 nested-freeform positioning evidence](../evidence/phase-6-nested-freeform-positioning.md).
The final implementation batch is recorded in
[Phase 6 descendant-subtree minimization evidence](../evidence/phase-6-descendant-subtree-minimization.md).
The listed capability batches and both supervisor-required corrections have implementation coverage,
but Phase 6 is not complete until an independent re-audit accepts the corrected settled tree.
The prior expanded-range audit, static corrections, deterministic matrix, browser proof,
performance result, and retained release gates are recorded in
[Phase 6 gate-audit evidence](../evidence/phase-6-gate-audit.md); that record is historical evidence,
not a final Phase 6 sign-off.

- Completed supervisor correction (detached renderer identity): one stable renderer portal target
  now moves between the docked content surface and the same-origin detached window. Every redock or
  window-loss path returns that target to the dock synchronously before closing the pop-out. Focused
  browser coverage proves the same renderer-owned input DOM node and local React state survive both
  detach and redock, while popup blocking, host rejection, window loss, minimize, deletion,
  theme/head propagation, placeholder geometry, focus restoration, baselines, and Axe remain green.
- Completed supervisor correction (non-tautological proof): removed
  `packages/workspace/tests/nested-freeform-representation.test.ts`. The retained Chromium
  representation proof exercises real XYFlow wrapper containment, store/viewport counts, recursive
  DOM movement, native scrolling, focus, accessibility, reflow, and the selected visual surface;
  no replacement metadata-restatement test was added.
- Supervisor-correction verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and
  pnpm 11.19.0 passed 40 focused detachment/static React tests and all six focused Chromium
  detachment workflows with the two retained baselines and owner/pop-out Axe scans. Changed-file
  quality selected nine project files and passed repository boundaries across 368 files, four-manifest
  dependency policy, formatting, lint and complexity, file lengths, strict types, dead-code analysis,
  517 unit tests across 49 files, six boundary tests, and plan-loop automation. A terminal yield hid
  the orchestration tail, so an exit-zero traced automation diagnostic plus direct
  package/playground build, exact tarball, and public-API report checks recovered those results
  without duplicating the green unit/type/lint stages. No dependency input changed, so the
  network-backed supply-chain gate and standing unavailable in-app-browser release gate were not
  retried.

- Phase-audit corrections: clipboard framing rejects overflow-derived non-finite geometry and
  clipboard paste retains one busy owner through current-registry and controlled-host
  reconciliation. Saved-view mutations are serialized with native pending state and restore reports
  host retention. Controller navigation, positioning confirmation, and selection actions revalidate
  subtree visibility. Empty ordered child regions again outrank their containing frames during
  structural collision. Toolbar expectations and affected baselines include the outline control,
  while the retained ownership test activates away from window auto-scroll edges.
- Phase-audit verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0
  `quality:all` passed for 368 project files with 519 unit tests, six boundary tests, automation,
  strict types, formatting, lint, dead-code, complexity/file-length, builds, exact tarball contents,
  documentation links, and the declaration report. The milestone benchmark retained checksum
  `149675570`, and the final settled-tree Chromium invocation passed all 110 workflows and every
  retained baseline. No dependency input changed, so the network-backed supply-chain gate was not
  duplicated. The packed-consumer invocation's terminal result was lost after artifact construction
  and remains a non-retried release gate under the audit's at-most-once rule; the standing unavailable
  in-app-browser gate was likewise not retried. The complete record is
  `docs/evidence/phase-6-gate-audit.md`.

- Completed (nested-freeform representation prerequisite): compared the plan-mandated all-section
  XYFlow graph, separately provided inner-XYFlow instances, and package-owned absolutely positioned
  recursive DOM in one executable playground proof. The all-section graph fails native parent DOM
  containment because XYFlow flattens parent and child wrappers. Six separately provided inner
  instances require seven total stores and viewports. The selected recursive DOM retains one outer
  XYFlow store/viewport while proving ordered/freeform switching, mixed-depth native scrolling,
  focus isolation, equal selected-block local deltas, atomic representative reparenting, bounded
  narrow layout, and one culling/geometry ownership path. This selects the implementation owner; it
  does not mark the schema-v2 or production interaction batch complete.
- Nested-freeform representation verification at the prerequisite checkpoint: exact Node 24.18.1,
  repository-local Corepack 0.35.0, and pnpm 11.19.0 focused coverage included two metadata tests
  later removed by the supervisor correction above because they did not exercise production. Focused
  Chromium coverage passed the challenger/store observations, the selected-owner interaction
  workflow, and the inspected narrow visual baseline; the corrected 320-CSS-pixel geometry was
  measured with every control inside the workbench bounds. Changed-file quality passed for 11
  project files with boundaries across 336 files, dependency policy, formatting, lint and
  complexity, file lengths, strict types, dead-code analysis, 468 unit tests across 46 files, six
  boundary tests, plan-loop automation, builds, exact tarball contents, documentation links, and
  the declaration report. The unrelated tarball-installed consumer passed lockfile policy, strict
  build, and Chromium runtime verification. No dependency input changed, so the network-backed
  supply-chain gate was not duplicated; the recorded unavailable in-app-browser release gate was
  not retried.
- Completed (nested-freeform document and projection foundation): incremented the strict document
  contract to schema version 2 and replaced the ordered-only layout with an explicit exact
  ordered/freeform union. One immutable `editLayout` controller command switches positioning with
  complete geometry or orientation input and one history boundary. Deletion, movement out,
  clipboard cloning, overflow, grouping, ungrouping, orientation, and external-drop planning now
  either preserve the freeform position-map invariant or reject a not-yet-owned local-position
  operation specifically. The selected recursive-DOM owner projects canonical local coordinates,
  measures content-sized direct wrappers for stable grow extent, preserves native scroll policy,
  retains one outer XYFlow viewport, and exposes no second culling owner. The playground and
  unrelated packed consumer exercise the declared schema-v2 package boundary. At that checkpoint,
  same-parent spatial gesture movement, cross-layout freeform destinations, and the positioning
  control remained in this batch; the local-movement follow-on below now completes the first slice.
- Nested-freeform document-foundation verification: exact Node 24.18.1, repository-local Corepack
  0.35.0, and pnpm 11.19.0 focused coverage passed the strict schema/command, recursive projection,
  overflow, movement-invariant, clipboard, grouping, and external-drop selectors. Two directly
  affected Chromium workflows passed exact local placement at representative depth, one outer
  viewport, measured grow extent, serialization, Axe, an inspected fitted baseline, 200% page
  scale, reduced motion, and 320-CSS-pixel reflow. Changed-file quality passed for 55 project files
  with boundaries across 344 files, dependency policy, formatting, lint and complexity, file
  lengths, strict types, dead-code analysis, 486 unit tests across 47 files, six boundary tests,
  plan-loop automation, builds, exact tarball contents, documentation links, and the declaration
  report. The unrelated tarball-installed consumer imported and rendered the public freeform
  contract, passed lockfile policy, strict build, and Chromium runtime verification. No dependency
  input changed, so the network-backed supply-chain gate was not duplicated; the recorded
  unavailable in-app-browser release gate was not retried.

- Completed (nested-freeform local-movement slice): replaced the flat section-move destination
  fields with an explicit ordered/freeform placement union and no compatibility path. Same-parent
  freeform pointer, touch, and keyboard gestures now preserve canonical stacking order and selected
  offsets, snap in destination-local coordinates, translate the complete block at local start
  edges, remain correct through nested native scrolling and outer zoom, publish one layout-only
  controlled command, announce coordinates, and restore the native handle focus. Framework-neutral
  application also accepts an explicit validated freeform destination for the downstream
  cross-layout target work. The playground, public guide, exact package allowlist, and unrelated
  packed consumer use the new contract. The complete record is
  `docs/evidence/phase-6-nested-freeform-local-movement.md`.
- Nested-freeform local-movement verification: exact Node 24.18.1, repository-local Corepack
  0.35.0, and pnpm 11.19.0 focused coverage passed 112 tests across eight movement and static React
  files. The five-test nested-freeform Chromium selector passed pointer, touch, keyboard, controlled
  commits, focus restoration, nested scroll during active movement, 2× outer zoom, Axe, 200% page
  scale, reduced motion, 320-CSS-pixel reflow, and two inspected baselines. The directly affected
  keyboard canvas-promotion selector passed the new destination discriminant. Changed-file quality
  passed for 42 project files with boundaries across 350 files, dependency policy, formatting, lint
  and complexity, file lengths, strict types, dead-code analysis, 495 unit tests across 48 files,
  six boundary tests, plan-loop automation, builds, exact tarball contents, documentation links,
  and the declaration report. The unrelated tarball-installed consumer passed exact-file
  allowlisting, lockfile policy, strict build, and runtime verification. No dependency input
  changed, so the network-backed supply-chain gate was not duplicated; the recorded unavailable
  in-app-browser release gate was not retried.

- Completed (nested-freeform cross-parent movement slice): unified ordered and freeform collision
  candidates under the existing target memory, hysteresis, invalid-target, and ancestor-promotion
  owner. Pointer and touch structural movement now resolve a measured selected block into exact
  destination-local positions through current outer viewport and nested-scroll geometry, preserving
  root offsets, snapping the active anchor, and translating the block at local start edges. Free-mode
  keyboard movement exposes the same measured freeform destinations, while sort-mode freeform arrows
  remain local. Canvas, ordered, and freeform transitions share exact host validation,
  spatial-preview, completion, announcement, and focus-restoration plans; framework-neutral
  application proves freeform-to-freeform position-key replacement. The complete record is
  `docs/evidence/phase-6-nested-freeform-cross-parent-movement.md`.
- Nested-freeform cross-parent verification: exact Node 24.18.1, repository-local Corepack 0.35.0,
  and pnpm 11.19.0 focused coverage passed 53 coordinate, collision, keyboard, and application tests.
  The complete six-test nested-freeform Chromium selector passed pointer, touch, local and structural
  keyboard movement, canvas/ordered/freeform transitions, controlled commits, focus restoration,
  nested scroll, 2× outer zoom, Axe, 200% page scale, reduced motion, 320-CSS-pixel reflow, and the
  inspected cross-parent baseline. Changed-file quality passed repository boundaries, dependency
  policy, formatting, lint and complexity, file lengths, strict types, dead-code analysis, unit and
  boundary tests, plan-loop automation, builds, exact tarball contents, documentation links, and the
  declaration report. The unrelated tarball-installed consumer passed lockfile policy, strict build,
  and runtime verification. No dependency input changed, so the network-backed supply-chain gate was
  not duplicated; the recorded unavailable in-app-browser release gate was not retried.

- Completed (nested-freeform grouping and ungrouping slice): grouping in a freeform parent now
  derives the selected block's exact local start position from canonical coordinates and its size
  from measured frames, replaces every selected position key with one group key, and preserves the
  first selected stacking index. Ungrouping converts measured direct-child rectangles into the
  destination parent's local coordinates, translates the complete block at nested start edges,
  replaces the group key atomically, and leaves ordered and root behavior intact. Keyboard menu
  activation, one controlled command, announcements, focus restoration, history, and Axe continue
  through the existing owners. The complete record is
  `docs/evidence/phase-6-nested-freeform-grouping.md`.
- Nested-freeform grouping verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and
  pnpm 11.19.0 focused coverage passed 13 grouping tests. The new nested-freeform Chromium selector
  and the directly affected ordered-history and top-level grouping selectors passed canonical
  placement, one-change publication, keyboard completion, focus restoration, announcements, Axe,
  and two inspected original-resolution baselines. Changed-file quality passed repository
  boundaries, deterministic dependency policy, formatting, lint and complexity, file lengths,
  strict types, dead-code analysis, unit and boundary tests, plan-loop automation, builds, exact
  tarball contents, documentation links, and the declaration report. The unrelated
  tarball-installed consumer passed lockfile policy, strict build, and runtime verification. No
  dependency input changed, so the network-backed supply-chain gate was not duplicated; the
  recorded unavailable in-app-browser release gate was not retried.

- Completed (nested-freeform clipboard and external-drop placement slice): replaced the public
  external-drop candidate's ordered-only insertion index with one exact ordered/freeform placement
  union. One captured recursive geometry frame now resolves the deepest eligible parent, produces
  an orientation-aware ordered index or a non-negative destination-local freeform position, and
  preserves preview/completion identity without a second layout flush. Clipboard paste resolves
  the same meaningful point, smart-places the cloned root block against direct destination
  siblings, preserves relative offsets, snaps in destination-local coordinates, and atomically
  inserts into the canvas, an ordered parent, or a freeform parent with an exact position map. The
  playground applies the public candidate without guessing layout, and the complete record is
  `docs/evidence/phase-6-nested-freeform-placement.md`.
- Nested-freeform placement verification: exact Node 24.18.1, repository-local Corepack 0.35.0,
  and pnpm 11.19.0 focused coverage passed 25 clipboard, external-drop, and navigation tests. The
  exact nested-freeform, generic external-drop, and clipboard Chromium selectors passed local
  coordinate conversion, one geometry capture, snapped non-overlap placement, controlled
  reconciliation, selection and focus handoff, announcements, undo/redo/reload coverage, Axe, and
  three inspected original-resolution baselines. Changed-file quality passed repository
  boundaries, deterministic dependency policy, formatting, lint and complexity, file lengths,
  strict types, dead-code analysis, unit and boundary tests, plan-loop automation, builds, exact
  tarball contents, documentation links, and the declaration report. The unrelated
  tarball-installed consumer passed lockfile policy, strict build, and runtime verification through
  the declared placement union. No dependency input changed, so the network-backed supply-chain
  gate was not duplicated; the recorded unavailable in-app-browser release gate was not retried.

- Completed (nested-freeform positioning and integrated-evidence slice): added one named native
  positioning control to the production recursive frame. Ordered-to-freeform conversion measures
  keyed direct-child rectangles and commits a complete normalized local position map without a
  prompt. Freeform-to-ordered conversion offers vertical or horizontal layout and confirms only
  when a pure LTR/RTL-aware projection establishes material rearrangement. The dialog isolates
  local Escape handling, restores focus, preserves selection, and reports exact accepted,
  unchanged, rejected, or controlled-host-retained outcomes through a pre-mounted live region.
  Direct-header visibility avoids expanding ancestor chrome during descendant interaction. The
  playground and unrelated packed consumer exercise both conversion directions through declared
  exports. The complete record is
  `docs/evidence/phase-6-nested-freeform-positioning.md`, with the bounded 512-child measurement in
  `perf/phase-6-nested-freeform-performance.md`.
- Nested-freeform positioning verification: exact Node 24.18.1, repository-local Corepack 0.35.0,
  and pnpm 11.19.0 focused coverage passed 57 command, React-geometry, static-contract, and canvas
  tests. New Chromium conversion and controlled-retention workflows passed exact change counts,
  measured positions, material confirmation, safe Escape, focus/selection reconciliation,
  announcements, and Axe. Eleven adjacent nested, recursive, and grouping workflows plus the
  focused structural-ownership probe passed, and all refreshed baselines were inspected at original
  resolution. The duplicate-failure rule prevented a third identical rerun of the complete reflow
  scenario and three legacy empty-container collision scenarios after focused corrections; their
  replacement Escape and ancestor-chrome probes are green and the unchanged exact scenarios remain
  committed for the phase audit. The milestone benchmark passed 80 public-controller conversions
  of 512 children in 867.521 ms with deterministic checksum `2,498,560`, and the unrelated
  tarball-installed consumer passed lockfile policy, strict build, and runtime conversion. The
  changed-file quality gate passed repository boundaries, dependency policy, formatting, lint and complexity,
  file lengths, strict types, dead-code analysis, tests, automation, builds, exact tarball contents,
  documentation links, and the declaration report. No dependency input changed, so the network-
  backed supply-chain gate was not duplicated; the recorded unavailable in-app-browser release gate
  was not retried.

- Completed (descendant-subtree minimization batch): added strict definition-level
  `minimizeScope: "subtree"` as an opt-in for containers while preserving body-only minimization as
  the default. The recursive projection unmounts collapsed descendant frames and releases their
  live geometry without changing the canonical document, history, or host payload. Selection
  reconciles to the collapsed ancestor, select-all and adjacent navigation use visible IDs, and
  direct focus, fit, or selection rejects with `section-descendants-collapsed`. The canonical
  outline remains available and explains the expansion requirement. Native expanded state, stable
  controlled targets, focus restoration, scope-specific announcements, the backend-free
  playground, and the unrelated packed consumer complete the public React contract. The complete
  record is `docs/evidence/phase-6-descendant-subtree-minimization.md`.
- Descendant-subtree minimization verification: focused framework-neutral, controller, selection,
  registry, static React, recursive browser, and outline coverage passes the default and opt-in
  contracts, strict validation, hidden-selection reconciliation, visible navigation, exact change
  counts, focus restoration, announcements, 320-CSS-pixel reflow, and Axe. The new collapsed view
  and directly affected expanded recursive baseline were inspected at original resolution.
  Changed-file quality and the packed-consumer boundary pass through the exact repository toolchain.
  No dependency input changed, so the network-backed supply-chain gate was not duplicated; the
  recorded unavailable in-app-browser release gate was not retried. CDP visual check: not run
  (standing unavailable in-app-browser release gate; reviewed Playwright Chromium baselines instead).

- Completed (viewport-culling batch): added strict opt-in all-depth browser windowing through one
  canvas-rooted observer, exact-size named placeholders, canonical-ID-scoped retained geometry,
  focused and active-frame pinning, and controller ancestry reveal around measured focus. Culling
  removes offscreen host renderers and complete descendant subtrees without changing
  `WorkspaceDocument`, selection, viewport, pane state, or structural history. The backend-free
  playground and unrelated packed consumer opt in through the declared React contract, while the
  complete ownership, accessibility, performance, and visual record is
  `docs/evidence/phase-6-viewport-culling.md`.
- Viewport-culling verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm
  11.19.0 focused coverage passed 69 tests across five framework-neutral, geometry, controller,
  canvas, and static React files. Three exact Chromium workflows passed for all-depth renderer
  reduction, focused offscreen pinning, controller remount after a completed viewport gesture,
  Axe, 200% page scale, reduced motion, 320-CSS-pixel reflow, and the inspected baseline.
  Changed-file quality passed for 34 project files with boundaries across 330 files, dependency
  policy, formatting, lint and complexity, file lengths, strict types, dead-code analysis, 466 unit
  tests across 45 files, six boundary tests, plan-loop automation, builds, exact tarball contents,
  documentation links, and the declaration report. The unrelated tarball-installed consumer
  passed lockfile policy, strict build, and runtime verification through the declared option type
  and React prop. No dependency input changed, so the network-backed supply-chain gate was not
  duplicated; the recorded unavailable in-app-browser release gate was not retried.

#### Completed batch: absolute/freeform positioning inside nested containers

This batch is a clean document-contract expansion, not a presence-based inference layered over the
ordered shape. Replace `WorkspaceChildLayout` with an explicit discriminated union close to:

```ts
type WorkspaceOrderedChildLayout = {
  positioning: "ordered";
  orientation: "horizontal" | "vertical";
  overflow: "grow" | "scroll";
  sectionIds: readonly string[];
};

type WorkspaceFreeformChildLayout = {
  positioning: "freeform";
  overflow: "grow" | "scroll";
  positions: Readonly<Record<string, { x: number; y: number }>>;
  sectionIds: readonly string[];
};

type WorkspaceChildLayout = WorkspaceOrderedChildLayout | WorkspaceFreeformChildLayout;
```

Every serialized child layout carries `positioning`; do not infer it from optional fields, retain
the old discriminator-less shape, or add a compatibility parser. `positions` has exactly one own
entry for every direct child ID and no others. Nested coordinates are finite, non-negative local
content coordinates; the root canvas continues to allow arbitrary finite workbench coordinates.
`sectionIds` remains canonical containment and deterministic traversal order and, for a freeform
parent, is also its persistent back-to-front sibling stacking order.

Required framework-neutral behavior:

- Add immutable, exact-validation commands for ordered/freeform switching. Ordered-to-freeform
  receives geometry-derived local positions for every child. Freeform-to-ordered receives the
  selected orientation. Both preserve child identity, canonical order, overflow, selection, and
  one structural history boundary.
- Invalid or incomplete position maps, non-finite or negative coordinates, unknown IDs, cycles,
  locked active sections, unsupported container kinds, and host-rejected changes fail specifically
  without a partial document.
- A same-parent spatial move updates only the moved freeform positions and preserves selected-block
  offsets. Snapping uses the package grid in the local coordinate system. Crossing the local start
  edge clamps or translates the complete selected block as one unit rather than collapsing its
  offsets.
- A structural free move can enter or leave any ordered or freeform container at any depth. Ordered
  destinations receive one insertion index; freeform destinations receive one position per moved
  selection root. Mixed-source selections converge atomically and preserve measured relative
  offsets after coordinate conversion.
- Grouping, ungrouping, copy/paste, deletion, history, locking, stacking commands, and controlled
  reconciliation preserve or intentionally derive freeform positions. No command may leave stale
  position keys behind.
- Grow mode derives a stable local content extent from child positions and measured sizes. Scroll
  mode retains the container's fixed dimensions, exposes the complete local extent through native
  scrolling, and isolates that scroll from the outer viewport. Empty freeform containers retain a
  useful drop surface and affordance.

Required React and interaction behavior:

- Completed prerequisite: the bounded XYFlow representation proof selected package-owned absolutely
  positioned recursive DOM. Use that single owner. Do not handwrite an alternative pan/zoom system
  inside a nested container: the outer XYFlow viewport remains the only workbench pan/zoom owner.
- In `sort` mode, an ordered child handle invokes sibling sorting while a root or freeform child
  handle invokes same-parent spatial movement. In `free` mode, the structural dnd-kit owner can
  reparent either kind. Pointer, touch, keyboard, cancellation, and controlled rejection each
  commit at most one command and restore the correct native handle focus.
- Freeform target resolution converts the displayed pointer/selection rectangle through outer
  pan/zoom and every intervening scroll offset into the destination's local coordinates. It reuses
  the characterized target memory, entry/exit hysteresis, ancestor promotion, invalid-target
  feedback, and preview/completion parity without inventing an ordered insertion marker.
- Arrow keys move a freeform selection by the configured snap step (or unsnapped keyboard step) in
  logical local coordinates. The existing structural activation keys expose cross-parent free-move
  destinations and announce the target container and resulting coordinates.
- Ordered orientation controls are unavailable for a freeform layout. A named positioning control
  switches the parent layout with confirmation only when the operation would materially rearrange
  children; it remains keyboard reachable and reports the accepted outcome.
- Marquee, focus/fit, navigator, minimap policy, generic connections, detachment placeholders, and
  viewport culling consume the same all-depth geometry after freeform movement, nested scrolling,
  layout switching, and remount. A freeform child must not be simultaneously windowed by two
  culling owners.
- The playground and unrelated packed consumer demonstrate mixed ordered/freeform containers at
  arbitrary representative depth, both overflow modes, same-parent spatial movement, every
  cross-layout reparenting direction, multi-selection, snapping, layout switching, keyboard use,
  200% zoom, 320-CSS-pixel reflow, reduced motion, RTL where logical controls apply, and Axe.

Record the representation decision, API and document changes, performance evidence, browser
baselines, focused regression matrix, packed-consumer proof, and exact verification commands in a
dedicated Phase 6 evidence document before marking this batch complete.

- Completed (pane-registration batch): added strict controller-only logical start/end pane
  registrations, controlled and uncontrolled one-active-pane state, linked utility-toolbar
  disclosures, close-focus restoration, and responsive layout that reserves measured canvas space
  when wide and stacks without covering focusable canvas content when narrow. Pane visibility,
  registration, renderer data, persistence, and authorization remain host-owned outside
  `WorkspaceDocument` and structural history. The backend-free playground registers its outline
  and saved-view surfaces, while the unrelated packed consumer switches between both through only
  declared exports. The complete record is `docs/evidence/phase-6-pane-registration.md`.
- Pane-registration verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm
  11.19.0 focused coverage passed four static React tests. The final exact Chromium selector passed
  two pane workflows and both directly affected saved-view workflows, covering controlled
  switching, measured wide layout, close-focus restoration, persistence, read-only usage, Axe,
  200% page scale, coarse pointers, reduced motion, RTL, and 320-CSS-pixel reflow; all three
  affected baselines were inspected at original resolution. Changed-file quality passed for 25
  project files with boundaries across 324 files, dependency policy, formatting, lint and
  complexity, file lengths, strict types, dead-code analysis, 460 unit tests across 44 files, six
  boundary tests, plan-loop automation, builds, exact tarball contents, and the declaration report.
  The unrelated tarball-installed consumer passed lockfile policy, strict build, and runtime pane
  switching through declared exports. No dependency input changed, so the network-backed
  supply-chain gate was not duplicated; the recorded unavailable in-app-browser release gate was
  not retried.

- Completed (generic edge-and-port batch): added a strict versioned host-controlled collection of
  labeled section ports and directed or undirected edges, with document-relative validation,
  immutable parsing, and deterministic side/offset projection. The optional React projection uses
  the existing all-depth measured geometry index and keeps fixed-weight routes, arrowheads, labels,
  and port marks aligned through canvas transforms and nested scrolling. Complete relationships are
  available in a named screen-reader group while the visible SVG remains non-interactive. The
  collection stays outside `WorkspaceDocument`; hosts retain persistence, authorization, editing,
  and domain meaning, and no graph execution, history, or upstream type enters the public boundary.
  The complete record is `docs/evidence/phase-6-generic-connections.md`.
- Generic edge-and-port verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm
  11.19.0 focused coverage passed 27 core/static React and color-contract tests. The final exact
  Chromium selector passed two all-depth connection workflows covering nested scroll, zoom,
  endpoint alignment, accessible descriptions, Axe, reduced motion, 200% page scale, dark
  appearance, 320-CSS-pixel reflow, and two inspected original-resolution baselines. Changed-file
  quality passed for 25 project files with boundaries across 317 files, dependency policy,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, 456 unit tests
  across 43 files, six boundary tests, plan-loop automation, builds, exact tarball contents, and the
  declaration report. The unrelated tarball-installed consumer passed lockfile policy, strict
  build, and runtime smoke through declared connection exports. No dependency input changed, so the
  network-backed supply-chain gate was not duplicated; the recorded unavailable in-app-browser
  release gate was not retried.

- Completed (saved viewport-preset batch): added a strict versioned core preference format and an
  optional controlled React panel for capturing, restoring, renaming, and deleting named
  viewports. Hosts retain collection order, IDs, persistence, authorization, and panel visibility;
  the package owns validation, exact capture/restore through the existing controller, native form
  semantics, focus handoff, and live feedback. Presets remain outside `WorkspaceDocument`, do not
  introduce structural history, and can be exposed as restore-only or used while document editing
  is read-only. The backend-free playground persists the host preference and the unrelated packed
  consumer imports only declared core and React exports. The complete record is
  `docs/evidence/phase-6-viewport-presets.md`.
- Saved viewport-preset verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and
  pnpm 11.19.0 focused coverage passed six core/static React tests. Exact Chromium selectors passed
  the two saved-view workflows plus both directly affected persistence workflows, covering exact
  viewport restoration, controlled CRUD reconciliation, reload persistence, read-only operation,
  focus, live announcements, Axe, 200% page scale, coarse pointers, reduced motion, and 320
  CSS-pixel reflow. The new baseline was inspected at original resolution. Changed-file quality
  passed for 18 project files with boundaries across 310 files, strict types, formatting, lint,
  complexity and file lengths, dead-code analysis, 450 unit tests across 42 files, six boundary
  tests, plan-loop automation, builds, exact tarball contents, and the declaration report. The
  unrelated tarball-installed consumer passed lockfile policy, strict build, and runtime smoke. No
  dependency input changed, so the network-backed supply-chain gate was not duplicated; the
  recorded unavailable in-app-browser release gate was not retried.

- Completed (mixed-parent batch-movement batch): section free moves and sortable-item movement now
  normalize selected ancestors, retain every remaining root in deterministic order, carry one
  aligned source parent per root, and remove all roots from their exact sources before inserting
  the complete block into one destination. Named-list item plans also carry aligned source-list
  ownership. Pointer, touch, and keyboard sessions use the active normalized root as their anchor,
  while one preview, one live-feedback owner, one controlled commit, and one focus-restoration path
  cover the complete block. Sorting and grouping retain their one-parent constraints. This
  intentionally supersedes the Phase 3 mixed-parent movement rejection and item active-row
  fallback without a compatibility path. The complete record is
  `docs/evidence/phase-6-mixed-parent-batch-movement.md`.
- Mixed-parent batch-movement verification: exact Node 24.18.1, repository-local Corepack 0.35.0,
  and pnpm 11.19.0 focused coverage passed 115 tests across nine files for section/item
  normalization, aligned ownership, strict application, multi-source layout preview,
  filtering/list reconciliation, and active-root keyboard anchoring. Exact Chromium selectors
  cover atomic mixed-section pointer movement, mixed-item keyboard transfer across named lists,
  retained host rejection, focus, announcements, and Axe; both new baselines and the directly
  affected rejection baseline were inspected at original resolution. Changed-file quality passed
  for 41 project files with boundaries across 305 files, all four manifests, formatting, lint and
  complexity, file lengths, strict types, dead-code analysis, 444 unit tests across 41 files, six
  boundary tests, plan-loop automation, package/playground builds, exact tarball contents, and the
  declaration report. The unrelated tarball-installed consumer passed lockfile-policy
  verification, strict build, and runtime smoke through declared exports. No dependency input
  changed, so the network-backed supply-chain gate is not duplicated; the recorded unavailable
  in-app-browser release gate is not retried.

- Completed (filtered canonical item-list batch): added strict ancestry-closed tree projection and
  visible-to-canonical move reconciliation, plus optional `visibleItemIds` on both controlled React
  item surfaces. Pointer, touch, and keyboard planning keeps one interaction owner and visible
  feedback while host policy and persistence receive canonical plans. Hidden siblings retain
  relative order, hidden descendants travel with visible subtree roots, and the playground and
  unrelated packed consumer use only declared exports. The complete record is
  `docs/evidence/phase-6-filtered-item-lists.md`.
- Filtered item-list verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm
  11.19.0 focused coverage passed 43 framework-neutral/static React tests. Final exact Chromium
  selectors passed the filtered empty-result/recovery/reorder workflow and 320 CSS-pixel reflow;
  four directly affected existing workflows remained green, with all five retained
  original-resolution baselines inspected. Changed-file quality passed for 27 project files with
  repository/import boundaries across 301 files, all four manifests, formatting, lint and
  complexity, file lengths, strict types, dead-code analysis, 436 unit tests across 41 files, six
  boundary tests, plan-loop automation, package/playground builds, exact tarball contents, and the
  declaration report. The unrelated tarball-installed consumer passed strict build and runtime
  smoke through declared filtered-list exports. No dependency input changed, so the network-backed
  supply-chain gate was not duplicated; the recorded unavailable in-app-browser release gate was
  not retried.

- Completed (named item-list and cross-list movement batch): added strict framework-neutral list
  validation, list-aware move planning and immutable application, plus one React interaction owner
  for visible named regions. Pointer, touch, and keyboard paths move complete item subtrees within
  or across list-scoped roots without exposing internal aggregation IDs. The playground persists
  the new list-array payload directly, and the unrelated consumer uses only declared package
  exports. The complete record is `docs/evidence/phase-6-named-item-lists.md`.
- Named item-list verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm
  11.19.0 focused coverage passed 41 core/static React tests and the final exact Chromium selector
  passed both keyboard/list-transfer workflows with two reviewed original-resolution baselines.
  Changed-file quality passed for 26 project files with repository/import boundaries across 296
  files, all four manifests, formatting, lint and complexity, file lengths, strict types,
  dead-code analysis, 426 unit tests across 40 files, six boundary tests, plan-loop automation,
  package/playground builds, exact tarball contents, and the declaration report. The unrelated
  tarball-installed consumer passed strict build and runtime smoke while using the public list
  helpers and React surface. No dependency input changed, so the network-backed supply-chain gate
  was not duplicated; the recorded unavailable in-app-browser release gate was not retried.

- Completed (top-level auto-layout batch): added a deterministic framework-neutral rectangle
  packer, a root-layout planner that retains the current minimum anchor, and one measured public
  controller command that atomically moves every unlocked root through the existing movement and
  history boundary. The playground and unrelated consumer opt into that command through the host
  toolbar-control contract; no document field, layout dependency, mandatory control, or upstream
  rendering type entered the public boundary. The complete record is
  `docs/evidence/phase-6-auto-layout.md`.
- Top-level auto-layout verification: exact Node 24.18.1, repository-local Corepack 0.35.0, and
  pnpm 11.19.0 focused unit coverage passed seven tests and the exact Chromium selector passed both
  workflows with its reviewed original-resolution baseline. Changed-file quality passed for 17
  project files with repository/import boundaries across 292 files, all four manifests,
  formatting, lint, file length, strict types, dead-code analysis, 415 unit tests across 39 files,
  six boundary tests, plan-loop automation, package/playground builds, exact tarball contents, and
  the declaration report. The unrelated tarball-installed consumer passed strict build and
  runtime smoke while importing the pure helpers and invoking the controller command. No
  dependency input changed, so the current network-backed supply-chain gate was not duplicated;
  the recorded unavailable in-app-browser release gate was not retried.

The initial package milestone did not wait for browser windowing or domain-safe clipboard
integration. Both are now implemented as optional capabilities of `@setta/workspace`, not separate
domain products. Whether any version is distributed publicly remains a separate decision.

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

- Completed: an optional hierarchical outline navigator built on the initial controller and traversal helpers.
- Completed: pure top-level auto-layout and packing commands.
- Completed: multiple named item lists within one section.
- Completed: same-section cross-list item movement.
- Completed: filtered-list reordering against a larger canonical tree.
- Completed: mixed-parent batch section and item dragging with active-root anchoring and atomic
  convergence into one destination.
- Completed: saved viewport presets.
- Completed: generic edges and ports.
- Completed: pane registration beyond toolbar and overlay slots.
- Completed: viewport culling.
- Completed: absolute/freeform positioning inside nested containers.
- Completed: collapsing an entire descendant subtree as an opt-in section-minimization scope.

Each follow-on addition must preserve the standalone one-sentence purpose, remain in the same package unless independently useful, and prove that its data ownership is generic rather than inherited from Setta application behavior.

## Testing strategy

### Core unit tests

Cover:

- Document validation and serialization, including the required ordered/freeform discriminator and
  exact freeform position-map ownership.
- Recursive containment validation and derived parent lookup.
- Coordinate conversion across canvas and nested placement contexts.
- Smart placement inside and outside viewport bounds with deterministic non-overlap and grid behavior.
- Deterministic top-level rectangle packing, root-anchor preservation, measured auto-layout planning, lock/readiness rejection, and one-command history.
- Root minimap projection and all-depth focus/fit bounds from the shared geometry index.
- Marquee intersection and containment geometry, selection-root normalization, deterministic navigation order, and combined selection bounds at every visible depth.
- Section single/block sorting, same-parent freeform movement, cross-layout free-move, grouping,
  ungrouping, positioning switches, ordered orientation, batch subtree deletion, persistent
  stacking, resize, size mode, overflow, presentation, title, lock, and minimize reducers.
- Root movement and resize snapping at positive and negative workbench coordinates, plus
  non-negative local snapping and selected-block edge clamping in nested freeform containers.
- Resize-axis, fixed/content promotion, minimum, maximum, and aspect-ratio constraint resolution.
- Light, dark, and system appearance resolution plus semantic token merging, sRGB gamut checks, APCA targets, and WCAG 2 compatibility measurements.
- Accent and tag-color parsing, gamut handling, semantic-role isolation, and accessible token derivation.
- Vertical and horizontal insertion-index planning plus freeform local-position planning through
  pan, zoom, and nested scroll coordinate spaces.
- Collision ranking, previous-target preference, previous-rectangle retention, child-over-parent promotion, midpoint transitions, zoom-scaled directional trigger distances, target hysteresis, and stale-target clearing.
- Selection-bound geometry, selected-root collision exclusion, and coordinate correction for single and multi-section drags under a scaled viewport.
- Layout-stable sortable preview transforms and exact preview/commit parity without constrained-scroll jumps.
- History coalescing and restoration.
- Item-tree and named-list validation.
- Single- and multi-item selection normalization plus same-list and cross-list move planning.
- Ancestry-closed filtered projection, visible-anchor reconciliation, hidden-order preservation,
  and complete hidden-subtree movement.
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
- Recursive rendering across mixed vertical, horizontal, and freeform layouts.
- Root-node projection, recursive-DOM descendant measurement, geometry-index cleanup, and agreement among marquee, selection bounds, focus/fit, collision, and nested drop coordinates.
- Sorting-mode and free-move-mode activation, preview, cancellation, and commit.
- Mutual exclusion among XYFlow root drag, dnd-kit sorting/free-move, selected-block movement, and viewport gestures through pointer, touch, keyboard, cancellation, and runtime mode changes.
- Single and selected-block cross-depth movement, local freeform movement, root normalization,
  grouping, ungrouping, and child positioning/orientation changes.
- Lock behavior for top-level and nested sections without disabling host content or descendants.
- Minimize and expand behavior with exact fixed-size restoration, content-fit resumption, and focus restoration.
- Resize gestures, fixed/content sizing, grow/scroll overflow, wheel isolation, and keyboard resizing with constraints and optional snapping.
- Marquee selection, partial/full containment, batch movement, batch actions, and transient render lift.
- Independent grid visibility and snap settings.
- Scoped light, dark, system, and custom-token appearance behavior.
- Configurable viewport gestures, built-in toolbar, host toolbar controls and overlays, minimap interaction, and controller helpers.
- Measured top-level auto layout through a host toolbar control without changing stack order, sizes, viewport, or selection.
- Optional outline hierarchy, disclosure, selection, direction-aware keyboard navigation, and controller-backed focus.
- Native named item-list regions with one shared pointer, touch, keyboard, focus, and announcement owner.
- Filtered item rows and targets with canonical host plans, visible-position feedback, stable
  geometry, empty-result semantics, and hidden-selection rejection.
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
- Arrange measured top-level roots without overlap, preserve their anchor and stack order, then undo and redo the one atomic movement command.
- Navigate recursive sections through the optional outline by pointer and keyboard, including modifier selection, RTL, 200% page scale, 320-pixel reflow, coarse targets, and reduced motion.
- Marquee-select with partial and full containment, move the selected block, batch lock/delete, group, ungroup, and use explicit stacking commands.
- Marquee-select and focus/fit nested descendants at unrelated depths, then verify their bounds agree with collision and drop geometry through pan, zoom, recursive reflow, grow/scroll changes, and minimization.
- Focus interactive content in offscreen root and nested sections without producing an independent workbench-wrapper scroll offset or unexpected canvas movement.
- Build a section tree to multiple depths, then move sections into, out of, and between nested containers.
- Render mixed ordered and freeform parents at multiple depths, spatially move one and multiple
  siblings, then move them through every ordered/freeform/root destination direction without
  losing local offsets.
- Move same-parent and mixed-parent normalized blocks through representative root and nested
  transitions, including pointer and keyboard completion.
- Reorder vertical and horizontal siblings in sorting mode.
- Switch a populated container between vertical and horizontal orientation without changing logical order.
- Switch a populated container from ordered to freeform and back using measured placement, then
  undo and redo both conversions without stale position keys or geometry drift.
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
- Single- and multi-item selection, same-list reorder, nesting, indent, outdent, atomic cross-list
  movement, and filtered reorder persisted against the complete canonical tree.
- Accept and reject external drops at root and nested coordinates without invoking native file semantics inside the package.
- Enforce read-only and granular layout/structure/presentation capabilities without a gesture starting and then snapping back.
- Invalid self, descendant, locked-active-section, and host-rejected move feedback.
- Keyboard-only completion of the primary workflows.
- Multiple viewport sizes.
- Browser zoom at 200% with the toolbar, creation menu, title editor, selection actions, and equivalent minimap navigation still reachable.
- Coarse-pointer interaction where automation supports it.

Run browser verification through the documented CDP workflow. Visual review must include default,
single-selected, marquee, multi-selected, selection-dragging, grouped, locked, read-only, minimized,
fixed-size, content-size, grow-overflow, scroll-overflow, sorting, free-moving, same-parent nested
freeform movement, snapped movement, resize handles, nested-parent preview, freeform-position
preview, empty-container affordance, sibling insertion preview, invalid-drop, vertical, horizontal,
freeform, default/compact/transparent/headerless chrome, accent and tag colors, toolbar default and
host controls, minimap on both sides, context-menu filtering and empty results, grid-hidden, each
grid pattern, custom grid color, light appearance, dark appearance, focus-visible, right-to-left,
coarse-pointer, and reduced-motion states.

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
- Sorting-mode, free-move-mode, target-stability, ordered/freeform positioning, and orientation
  guide.
- Locking, minimizing, fixed/content sizing, grow/scroll overflow, and resizing reference.
- Grid, snapping, appearance, per-section presentation, chrome variants, and semantic theme-token reference.
- Single- and multi-item sortable-tree plus named-list, cross-list, and filtered canonical
  reconciliation reference.
- Detachable-window, adapter-driven clipboard, and optional outline-navigator integration guidance.
- Pure rectangle-packing and measured top-level auto-layout guidance.
- Persistence integration example.
- Saved viewport-preset ownership, persistence, and restore-only integration guidance.
- Generic edge-and-port ownership, validation, persistence, theming, and projection guidance.
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
- References or variants. Saved viewport presets were implemented later as an optional same-package
  Phase 6 capability.
- Browser pop-out windowing and copy/paste in the initial milestone; both were implemented later as
  optional same-package Phase 6 capabilities.
- Generic edges, ports, or execution semantics in the initial scope.
- Side-pane systems in the initial scope.
- Absolute/freeform child positioning inside nested containers in the initial scope. Free-move mode means cross-container section movement; nested destinations still use their parent's vertical or horizontal ordered layout.
- Hiding or collapsing a section's complete descendant subtree when minimizing it in the initial scope; body-only behavior remains the default, and opt-in subtree scope was implemented later as a same-package Phase 6 capability.
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
