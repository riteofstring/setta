# Canvas/WebGPU Workspace Replacement Plan

## Goal

Replace the current xyflow/dnd-kit workspace with a single retained
canvas/WebGPU workspace renderer.

The first benchmark and first useful milestone is the Settings project's
`All Settings` view because it is a dense real view made mostly from Dict
sections. Settings is only the benchmark fixture. The renderer must operate over
generic project and Param Dict state, not Settings-specific section ids, param
ids, names, values, or layout shortcuts.

This is not the HTML-in-canvas approach from
`go-rewrite-canvas-html-gpu-surfaces-plan`. The new renderer must draw structured
scene data directly. It must not capture, rasterize, project, preserve, hydrate,
or texture existing React/HTML section DOM.

## Non-Negotiable Architecture

These rules define the architecture. Code that violates them is on the wrong
track.

- The workspace pan/zoom area is one canvas/WebGPU-owned surface, not one canvas
  per section.
- xyflow is completely replaced for the workspace. The app workspace must not
  mount `ReactFlow`, xyflow `Viewport`, xyflow node renderers, xyflow edge
  renderers, xyflow controls, or xyflow minimap.
- The xyflow minimap is completely replaced. The minimap is rendered from the
  retained canvas scene model and must not depend on xyflow nodes, SVG minimap
  nodes, section DOM, or live React section components.
- dnd-kit is not used anywhere inside the workspace. That includes section drag,
  section reorder/reparent, section resize coordination, Param drag/reorder, and
  nested Param drag. Workspace drag/drop is implemented by the canvas interaction
  controller and scene hit testing.
- Passive sections in the workspace are not DOM components. The workspace must
  not mount passive `SectionContainer`, `SectionHeader`, `DictArea`,
  `ParamGroupContainer`, `ParamDndContext`, `ParamDndList`, `ParamSwitch`,
  `ParamContainer`, `ParamUI`, CodeMirror, or resize-handle DOM for sections
  owned by the canvas renderer.
- DOM is allowed only for active overlays that require native/browser behavior,
  such as an active CodeMirror editor session, searchable combobox session,
  native color input session, popovers, context menus, or app chrome outside the
  workspace.
- DOM overlays are positioned from scene geometry. They must not own pan/zoom,
  section placement, row layout, scrolling, minimap geometry, or passive
  rendering.
- There is no runtime fallback that silently switches between xyflow and the new
  canvas workspace. During development, comparison can use git history,
  separate worktrees, benchmark artifacts, or explicitly named debug-only
  harnesses, but not a production dual renderer.

## Compatibility Policy

This branch does not need backward compatibility, legacy support, migrations,
transitional adapters, compatibility shims, dual-read/write paths, old-field
aliases, or silent compatibility fallbacks.

Rules:

- Replace the active workspace path. Do not bridge the old xyflow/dnd-kit
  workspace into the new renderer.
- Unsupported workspace content must show an explicit unsupported canvas
  placeholder or fail loudly during development. It must not silently route to
  the old React/xyflow/HTML workspace.
- Legacy Param UI components may be used as reference material, but they must
  not be mounted as passive workspace content or hidden compatibility surfaces.
- Dependency changes are allowed when a dependency is the right technical fit.
  Dependency count should not be used as a reason to avoid Lezer, Shiki, or
  another appropriate parser/highlighter/editor support library. Direct
  dependency versions still need to be pinned exactly and lockfiles updated
  through the repo tooling.

## Scope

In scope for the workspace replacement:

- Canvas/WebGPU-owned viewport transform, pan, zoom, coordinate conversion, and
  persistence of the project viewport.
- Canvas/WebGPU-owned section placement, section chrome, section bodies,
  section selection, section drag, section resize, and section hit testing.
- Canvas/WebGPU-owned minimap, including section previews, viewport mask,
  selected-section state, and minimap interactions.
- Canvas/WebGPU-owned Param Dict passive rendering:
  - nested row layout
  - row shells
  - labels
  - value previews
  - error state
  - selection, hover, active, and focus visuals
  - inactive switches as canvas-drawn toggles
  - inactive color inputs as canvas-drawn swatches and value previews
  - inactive dropdown/combobox inputs as canvas-drawn selected-value previews
    plus affordances
  - text/code/textarea passive previews
  - per-section scrollbars and clipped section bodies
- Canvas-owned interaction handling for Param Dict rows and controls.
- Canvas-owned section and Param drag/drop for in-workspace interactions.
- One active editor overlay host above the canvas for DOM-backed editors,
  native inputs, and app popups. Canvas-native popups render in the scene.
- Performance reports under `perf/` before and after meaningful milestones.

Out of scope for the first benchmark milestone:

- Full canvas-native CodeMirror replacement.
- Generic HTML-in-canvas rendering.
- Rendering arbitrary embedded DOM widgets inside section bodies.
- Full feature parity for every non-Dict section type on day one.
- Full accessibility parity for inactive canvas-rendered rows.
- Text selection inside inactive canvas-rendered previews.

Important scope clarification:

- The first milestone may target Settings `All Settings` and generic Dict
  sections first, but this does not mean xyflow remains the workspace owner.
  Views containing unsupported section types can show canvas placeholders or be
  considered incomplete until their section renderer exists. They must not keep
  xyflow as a hidden compatibility path in the workspace.

## Milestone Boundaries

Architecture rules apply to every milestone. Milestone boundaries only define
what must be complete before landing the first benchmark path.

### Benchmark Milestone: Settings `All Settings`

Required:

- The active workspace root uses the canvas workspace.
- No xyflow, xyflow minimap, dnd-kit, passive section DOM, passive Param row
  DOM, or inactive CodeMirror instances in the active workspace.
- Generic Dict scene derivation, row layout, visible-row rendering, clipped
  section scrolling, hit testing, minimap rendering, and basic interactions.
- Active editor overlay host for initial text, code, combobox, and color cases.
- Canvas-native controls for supported switches, fixed dropdowns, fixed
  palettes, sliders, buttons, and disclosures.
- Unsupported non-Dict sections show explicit canvas placeholders.
- Before/after performance report under `perf/`.
- Browser visual verification against clean `go-rewrite` references.

Not required for this milestone unless the Settings benchmark fixture depends on
it:

- Full nested section interaction parity.
- Every non-Dict section renderer.
- Every complex custom Param editor.
- Broader accessibility parity for inactive canvas-rendered content.

### Full Workspace Acceptance

Required after the benchmark milestone:

- Nested section rendering and interaction parity.
- Section reorder/reparent across supported parent/child regions.
- Non-Dict section renderers.
- Broader accessibility parity.
- Full custom Param coverage through canvas preview, canvas-native interaction,
  overlay-backed editing, or right-pane editing.

## Source Of Truth

- Go remains the owner for canonical project behavior, validation, endpoint
  shapes, contracts, and correctness-sensitive runtime behavior.
- The frontend canvas scene must use existing generated frontend types and
  owner-defined project state surfaces where available.
- Do not create duplicate TypeScript contract mirrors for project, section, or
  Param data when generated or owner-defined types already exist.
- Renderer-local scene records are allowed when they are derived view models for
  geometry, hit testing, and drawing. They must be derived from authoritative
  project state, not stored as duplicated truth.
- Any downstream Python or TypeScript surfaces needed from Go-owned contracts
  should be generated, not hand-maintained.

## Workspace Mutation Contract

Before implementing each interaction, define its canonical mutation path.

For each operation, record:

- operation name
- authoritative owner: existing frontend action, Go endpoint, generated
  contract, or new required endpoint
- draft state location
- preview behavior before commit
- commit trigger
- cancel behavior
- validation behavior
- optimistic update and rollback behavior
- undo/redo grouping behavior
- affected scene invalidation keys
- whether the operation is supported in the first benchmark milestone

Continuous interactions must use explicit begin/update/commit/cancel semantics.
They must not emit many independent canonical mutations unless that is the
declared product behavior.

Initial operations that need an explicit contract before their implementation
lands:

| Operation | Contract requirement |
| --- | --- |
| viewport persistence | Define when pan/zoom becomes canonical project viewport state and how transient viewport movement is coalesced. |
| section scroll state | Define frontend UI-state ownership and invalidation; section scroll must not mutate canonical project state unless product behavior requires it. |
| section drag | Define drag draft state, preview bounds, commit trigger, cancel behavior, validation, and undo grouping. |
| section resize | Define resize draft state, minimum/maximum validation, preview behavior, commit trigger, cancel behavior, and undo grouping. |
| section reorder/reparent | Define supported parent/child drop zones, validation, commit mutation, cancel behavior, and undo grouping. |
| Param reorder | Define row drag draft state, nested drop target validation, commit mutation, cancel behavior, and undo grouping. |
| switch/button/disclosure | Define immediate commit path, validation behavior, and scene invalidation keys. |
| fixed dropdown/palette | Define canvas popup state, selected draft, commit trigger, cancel behavior, and validation. |
| slider/range | Define drag draft state, preview behavior, commit-on-release or continuous commit policy, and undo grouping. |
| text/code draft | Define active editor session state, commit trigger, cancel behavior, validation, and scene invalidation keys. |
| combobox selection | Define query/draft state, selection commit trigger, cancel behavior, and validation. |
| arbitrary color | Define live draft preview policy, commit trigger, cancel behavior, and validation. |

## Existing Systems To Replace

The active workspace path currently flows through:

- `frontend/src/components/Pages/Project/UiPage.tsx`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- `frontend/src/forks/xyflow/minimap/*`
- `frontend/src/forks/dnd-kit/SectionDndContext.tsx`
- `frontend/src/components/Section/Container/*`
- `frontend/src/components/Section/Layouts/DictArea.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/ParamDndContext.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

The replacement path should introduce a new workspace root, for example:

- `frontend/src/components/WorkspaceCanvas/WorkspaceCanvas.tsx`
- `frontend/src/components/WorkspaceCanvas/workspaceScene.ts`
- `frontend/src/components/WorkspaceCanvas/workspaceRenderer.ts`
- `frontend/src/components/WorkspaceCanvas/workspaceInteractions.ts`
- `frontend/src/components/WorkspaceCanvas/workspaceMinimap.ts`
- `frontend/src/components/WorkspaceCanvas/overlays/*`

Names can change, but ownership must not: the new workspace root replaces the
xyflow/dnd-kit workspace root.

## Retained Scene Model

The canvas workspace owns a retained scene model derived from current project
state.

The scene model must include:

- viewport transform and viewport size
- project bounds
- minimap transform, viewport mask, and minimap hit regions
- section records:
  - section id
  - section type
  - section name
  - parent section id, or `null` for root workspace sections
  - child section ids in deterministic order
  - local bounds relative to the parent section or root workspace
  - derived world bounds in workspace coordinates
  - z/order within the parent
  - selected/hover/active states
  - chrome/header geometry
  - body geometry
  - child/content region geometry where nested sections can render
  - clip region and scroll offset where the section owns nested content
  - resize handle regions
  - edge/port regions where applicable
  - section-specific render model or placeholder model
- Dict section records:
  - pinned and unpinned body regions
  - section scroll offset
  - visible row range with overscan
  - row records
  - row rects
  - nesting depth
  - nesting rails
  - Param id
  - Param type
  - label
  - passive value-cell preview model
  - optional code preview token runs
  - validation/error state
  - canvas support declaration
  - active input strategy
  - commit/cancel policy
  - control kind
  - control rects
  - hit regions and hit-region intents for rows and controls

Rendering and interaction must use the same scene records. If the renderer draws
a row or control at a rectangle, hit testing must use that same rectangle.

Scene derivation must not rely on DOM layout. It can use deterministic geometry
constants, project layout metadata, generated contract data, and cached text
measurement results. Canvas-only constants should live in a small mapping table
with comments tying them to the existing UI visual anchors.

## Nested Sections

Nested sections are part of the same retained scene model and the same
canvas/WebGPU workspace surface. They must not introduce nested React section
trees, nested xyflow instances, nested dnd-kit contexts, or one canvas per
parent section.

Rules:

- Model sections as a scene graph with stable section ids, optional parent ids,
  local bounds, derived world bounds, child ordering, and z/order within each
  parent.
- Parent/child relationships must come from authoritative project state or a
  Go-owned contract/update path. Do not infer nesting from frontend geometry
  heuristics.
- Coordinate conversion walks the scene graph:
  screen -> workspace -> parent section -> child section -> row/control.
- Hit testing returns the full scene path, for example:
  workspace -> parent section -> child section -> Dict row -> value cell.
- Rendering uses a deterministic traversal of the scene graph with clip stacks
  for parent content regions and section bodies.
- Parent sections define child/content regions, clipping, scroll state, and
  allowed child drop zones when the product supports nested placement.
- Child section drag, resize, reorder, and reparent operations are owned by the
  workspace interaction controller and scene hit testing, not dnd-kit.
- Nested section drop targets must be explicit scene records. Invalid targets
  should fail visibly during development, not fall back to legacy behavior.
- Minimap geometry is derived from each section's world bounds in the same scene
  graph. Nested sections can be summarized, drawn at reduced detail, or omitted
  by an explicit minimap policy, but the policy must not depend on DOM.
- Selection, hover, keyboard focus, and active editor sessions store scene item
  ids or scene paths so parent/child ambiguity cannot leak into interactions.

## Renderer

The renderer draws the entire workspace into the workspace canvas/WebGPU
surface.

It must draw:

- viewport background and grid if enabled
- section placement
- nested section traversal with parent clip stacks
- section chrome/header visuals
- section bodies and clipping regions
- visible Dict rows only, with overscan
- Dict nesting rails and indentation
- Dict labels and passive values
- inactive Dict controls:
  - switches as canvas toggles
  - color params as swatches and passive value text
  - dropdown/combobox params as selected value plus affordance
  - text/textarea params as passive text previews
  - code params as passive previews with syntax-highlighted token runs when
    available
- Dict errors, hover, active, focus, and selected visuals
- per-section scrollbars
- minimap section previews and viewport mask from the same scene model
- selection outlines, drag previews, resize affordances, and drop indicators

The renderer must not draw by asking React to mount section/row components. It
must not use DOM screenshots, SVG minimap nodes, or HTML-to-texture rendering.

The implementation can start with Canvas 2D if that gets the architecture in
place quickly. WebGPU can replace the draw backend behind the same scene model
when needed. The architecture is the retained scene and single workspace
surface, not the first drawing API.

## Canvas Platform Lifecycle

The workspace renderer must handle:

- devicePixelRatio changes
- canvas CSS size versus backing-store size
- `ResizeObserver`-driven viewport resize
- font loading and font fallback invalidation
- theme changes
- browser zoom changes
- WebGPU device/context loss when using WebGPU
- renderer cleanup on unmount
- pointer capture release on cancel, blur, Escape, lost pointer, or unmount

The scene coordinate system is CSS-pixel based. Renderer backends are
responsible for mapping CSS pixels to device pixels without changing scene
geometry, layout, hit testing, or interaction math.

## Canvas Value Cells And Editor Sessions

Passive Param rows are not DOM controls. They are canvas-rendered value cells:
scene records with preview content, visual state, hit regions, and declared
interaction intents.

Core invariants:

- No passive per-row DOM.
- No hidden legacy Param UI.
- No inactive editors.
- No DOM-owned layout.
- No DOM-owned pan/zoom.
- No duplicated local truth for committed values.
- At most one active editor session per workspace.

"One active editor session" does not mean one literal DOM node. A session may
mount the DOM nodes it needs internally, such as an input plus popup list, a
CodeMirror wrapper, a native picker trigger, or an accessibility live region.
The invariant is that only one active editing workflow exists at a time.

The active editing lifecycle is:

1. Scene derivation creates passive rows, value cells, and hit regions from
   authoritative project state.
2. The user points, clicks, presses a key, drags, or scrolls over a hit region.
3. The interaction controller decides whether the gesture is selection,
   navigation, drag, resize, immediate commit, canvas popup, DOM overlay, or
   right-pane editing.
4. Canvas-native controls use transient interaction state rendered by the canvas
   scene.
5. Overlay-backed editors create one `ActiveEditorSession`.
6. Overlay geometry comes from the scene model, not DOM measurement.
7. Draft values live in the active editor session.
8. Commit/cancel flows through canonical project update paths.
9. The scene is regenerated from authoritative project state.
10. Passive previews update from project state, not from editor-local state.

Inactive value-cell rules:

- Do not mount inactive `input`, `select`, `textarea`, CodeMirror,
  Radix/downshift combobox DOM, native color input, or Param UI component DOM in
  the workspace.
- Text, code, password, date, time, number, and textarea Params render as
  canvas previews. Password previews must preserve current masking semantics.
- Switch and checkbox Params render as canvas toggles.
- Color Params render as canvas swatches plus passive value text.
- Dropdown and combobox Params render as canvas selected-value previews plus an
  affordance.
- Button-like controls render as canvas controls if supported by the workspace.
- Inactive hover, selected, focus, disabled, readonly, and error states are
  canvas-rendered states derived from the scene model.
- Unsupported controls must fail visibly during development or use an explicit
  active overlay/right-pane path. They must not silently mount legacy DOM inside
  the workspace.

## Input Taxonomy

Each Param kind belongs to one of four categories.

### Pure Passive Canvas Preview

These are not controls while inactive:

- text preview
- code preview
- textarea preview
- password preview
- date/time preview
- number preview
- dropdown selected value
- color swatch
- readonly value
- error state
- disabled state

### Canvas-Native Active Controls

These stay fully canvas/WebGPU even while active:

- boolean switch
- checkbox-like toggle
- button/action control
- disclosure and expand/collapse control
- radio group or small fixed enum
- simple fixed dropdown
- fixed color palette
- slider/range
- row selection
- row drag handle
- section resize handle
- section scrollbar

Canvas-native active state is transient interaction state, such as pressed,
focused, highlighted option, color-palette draft, or slider drag value. It is
rendered by the same canvas/WebGPU renderer and does not mount DOM.

### Overlay-Backed Editors

These use browser/native/editor behavior while active:

- short text input
- password input
- number input when arbitrary typed entry is needed
- textarea
- CodeMirror code editor
- searchable combobox
- arbitrary native color input
- native date/time input where typed or platform picker behavior is needed
- file/path picker where browser/native behavior is required

Use the lightest active editor that preserves behavior. Do not use CodeMirror
for every text-like value if a native input or textarea is enough.

### Complex Active Surfaces

Large structured values, long code, nested objects, and awkward custom widgets
should use an explicit right-pane editor or modal-like active surface when a row
overlay would be cramped or hard to operate. The passive canvas row should show
a summary and edit affordance.

Suggested mapping:

| Param kind | Passive render | Active strategy |
| --- | --- | --- |
| short text | canvas text preview | native `input` overlay |
| number | canvas formatted value | native/text numeric overlay, stepper, or slider |
| password | masked canvas preview | native password input overlay |
| textarea | clipped multiline canvas preview | `textarea` overlay, or CodeMirror only if needed |
| code | canvas code preview with token runs | CodeMirror overlay |
| boolean | canvas switch | canvas-immediate commit |
| fixed small enum | canvas selected value | canvas popup or direct cycling |
| searchable enum | canvas selected value | DOM combobox overlay |
| fixed color palette | canvas swatch | canvas palette |
| arbitrary color | canvas swatch | native color input overlay or custom canvas picker |
| slider/range | canvas value/track | canvas drag |
| complex custom widget | canvas summary | right-pane editor |

## Input Activation Contract

Every editable Param kind must declare its workspace behavior explicitly:

- passive renderer kind
- passive value preview model
- hit regions
- activation gesture
- active input strategy
- commit mode
- cancel behavior
- keyboard behavior
- validation timing
- close/reposition policy during pan, zoom, section scroll, and project updates
- unsupported behavior

Allowed active input strategies:

```ts
type ActiveInputStrategy =
  | "canvas-immediate"
  | "canvas-popup"
  | "canvas-drag"
  | "dom-native-overlay"
  | "dom-rich-overlay"
  | "right-pane"
  | "unsupported";
```

Each Param renderer must also declare its canvas support level:

```ts
type CanvasParamSupport =
  | { passive: "preview"; active: ActiveInputStrategy }
  | { passive: "unsupported-placeholder"; active: "unsupported" };
```

Adapter code may use DOM for an active editor, but it may not own row layout,
passive rendering, section placement, scrolling, pan/zoom, or minimap geometry.

## Editor Adapter Contract

Active editors should use a small adapter interface so text inputs, CodeMirror,
comboboxes, color pickers, and right-pane editors share the same lifecycle.

Example shape:

```ts
interface WorkspaceEditorAdapter<TValue, TDraft = TValue> {
  kind: ActiveEditorKind;

  canEdit(param: SceneParamRecord): boolean;

  open(args: {
    param: SceneParamRecord;
    rect: SceneRect;
    viewport: WorkspaceViewport;
    initialValue: TValue;
  }): ActiveEditorSession<TDraft>;

  renderOverlay(args: {
    session: ActiveEditorSession<TDraft>;
    rect: SceneRect;
    onDraftChange: (draft: TDraft) => void;
    onCommit: () => void;
    onCancel: () => void;
  }): React.ReactNode;

  commit(args: {
    session: ActiveEditorSession<TDraft>;
    projectState: ProjectState;
  }): ProjectMutation;

  shouldCloseOnViewportChange(change: ViewportChange): boolean;
}
```

The adapter is lifecycle glue only. It may render the active DOM editor, but it
must not render passive rows, compute row geometry, own committed project state,
or import legacy Param UI as a compatibility path.

## Active Editor Sessions

Overlay-backed editing uses a formal session model instead of ad hoc local
component state.

Example shape:

```ts
type ActiveEditorSession =
  | {
      kind: "text";
      paramId: ParamId;
      sectionId: SectionId;
      rectKey: SceneRectKey;
      initialValue: string;
      draftValue: string;
      commitMode: CommitMode;
    }
  | {
      kind: "code";
      paramId: ParamId;
      sectionId: SectionId;
      rectKey: SceneRectKey;
      initialValue: string;
      draftValue: string;
      commitMode: CommitMode;
    }
  | {
      kind: "combobox";
      paramId: ParamId;
      sectionId: SectionId;
      rectKey: SceneRectKey;
      query: string;
      selectedValue: string | null;
      commitMode: CommitMode;
    }
  | {
      kind: "color";
      paramId: ParamId;
      sectionId: SectionId;
      rectKey: SceneRectKey;
      initialValue: string;
      draftValue: string;
      commitMode: CommitMode;
    };
```

Commit modes:

```ts
type CommitMode =
  | "immediate"
  | "onBlur"
  | "onEnter"
  | "onExplicitApply"
  | "continuousDraft";
```

Commit examples:

- Switch, checkbox, button, and disclosure: immediate commit.
- Short text: draft locally, commit on Enter or blur, cancel on Escape.
- Number: draft locally, validate before commit, support Enter/blur where
  product behavior requires it.
- CodeMirror: draft locally, commit on explicit save or blur according to the
  current product behavior.
- Combobox: commit on option selection, cancel on Escape.
- Color picker: optionally show live draft feedback, but canonical commit must
  follow the declared policy.
- Fixed dropdown, fixed palette, and slider: prefer canvas-native interaction
  with explicit immediate, release, or apply commit behavior.

## Passive Code Highlighting

Inactive code previews can use syntax-highlighted token runs in canvas/WebGPU.
Do not reimplement CodeMirror's highlighting from scratch.

Recommended approach:

- Use the CodeMirror/Lezer highlighting stack first when active editing also
  uses CodeMirror and parity is valuable.
- Use Shiki if static preview quality and broad theme/language support matter
  more than exact active-editor parity.
- Use Tree-sitter only if the project already needs that parser stack or has a
  language requirement not covered by Lezer/Shiki.
- Do not start with highlight.js because its primary output is highlighted HTML,
  which is the wrong shape for a canvas renderer.

The highlighter should produce scene-ready token runs:

```ts
type CodePreviewTokenRun = {
  line: number;
  fromColumn: number;
  toColumn: number;
  text: string;
  color: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: "normal" | "bold";
};
```

The passive highlighter service should be explicit and cacheable:

```ts
interface PassiveCodeHighlighter {
  highlight(args: {
    code: string;
    languageId: string;
    themeId: string;
    maxLines: number;
    maxColumns: number;
  }): Promise<CodePreviewTokenRun[]>;
}
```

Highlighting rules:

- Never run syntax highlighting in the per-frame draw loop.
- Highlight only visible rows plus overscan.
- Limit passive previews to bounded lines and columns.
- Render plain text first while async highlighting is pending.
- Cache by code hash, language, theme, preview limits, font, and preview width.
- Move expensive highlighting to a worker if measurements require it.
- Use one token palette for active CodeMirror themes and passive canvas drawing
  where possible.

## Scene And Cache Invalidation

Every derived scene and async cache result must be tied to explicit revision
keys.

Suggested revision keys:

- `projectRevision`
- `viewportRevision`
- `sectionScrollRevision`
- `themeRevision`
- `fontRevision`
- `devicePixelRatioRevision`
- `textMeasurementRevision`
- `highlighterRevision`

Async work may update the render cache only if its input key still matches the
current scene requirements. Stale highlighter, measurement, or derivation
results must be discarded.

Scene records should include enough stable ids and revision keys to avoid
applying cached token runs, text measurements, draw commands, or hit regions to
the wrong Param, section, theme, font, preview width, device pixel ratio, or
viewport state.

Invalidation rules:

- Project changes invalidate affected section records, Param rows, hit regions,
  minimap bounds, and project bounds.
- Viewport changes invalidate screen-space draw transforms and overlay
  placement, but should not force row layout recomputation unless scale-specific
  caches require it.
- Section scroll changes invalidate visible row ranges, overscan, scrollbars,
  row hit regions, and overlay placement for that section.
- Theme changes invalidate colors, code token palette mapping, text
  measurements where fonts change, and all cached draw commands.
- Font loading, font fallback changes, browser zoom changes, and device pixel
  ratio changes invalidate text measurements and backing-store dependent draw
  resources.
- Highlighter cache entries are keyed by code hash, language, theme, preview
  limits, font, and preview width. Stale async token runs must not be attached
  to a newer row value.

## Interaction Controller

The interaction controller owns workspace input.

It must:

- Convert pointer coordinates between screen, viewport, scene, section, row,
  and minimap spaces.
- Resolve nested scene paths for parent sections, child sections, rows, and
  controls.
- Handle pan and zoom directly, without xyflow/d3-zoom.
- Persist viewport changes through the existing project state/update path.
- Hit test sections, chrome, resize handles, Dict rows, Dict controls,
  scrollbars, minimap, and empty canvas.
- Track `hoveredHitRegion`, `selectedSceneItem`, `keyboardFocusedSceneItem`,
  transient canvas-active control state, and `activeEditorSession` separately.
- Handle section selection and multi-selection.
- Handle section drag, resize, nested reorder, and reparent without dnd-kit.
- Handle Param row selection and Param drag/reorder without dnd-kit.
- Handle section body wheel scrolling and maintain per-section scroll offsets.
- Handle canvas-native controls directly where appropriate.
- Open a DOM overlay only for workflows that need native editing/search/input
  behavior.
- Commit changes through existing project update actions or new Go-owned
  endpoint contracts where required.

Every hit region must declare exactly one primary intent:

```ts
type HitRegionIntent =
  | WorkspaceHitIntent
  | SectionHitIntent
  | DictRowHitIntent
  | ControlHitIntent
  | MinimapHitIntent
  | EdgePortHitIntent
  | "unsupported";

type WorkspaceHitIntent =
  | "pan-viewport"
  | "open-context-menu";

type SectionHitIntent =
  | "select-section"
  | "drag-section"
  | "resize-section"
  | "scroll-section"
  | "scrollbar"
  | "open-context-menu";

type DictRowHitIntent =
  | "select-row"
  | "drag-row"
  | "activate-editor"
  | "open-context-menu";

type ControlHitIntent =
  | "activate-editor"
  | "toggle-immediate"
  | "open-canvas-popup"
  | "open-dom-overlay"
  | "open-context-menu";

type MinimapHitIntent =
  | "minimap-pan"
  | "minimap-zoom"
  | "minimap-jump";

type EdgePortHitIntent =
  | "edge-or-port";
```

Hit region records should carry both a scene target/path and an intent. This
prevents accidental behavior where one click both selects and edits, where a
drag begins when the user meant to activate a value cell, or where minimap,
section chrome, viewport, and row interactions compete for the same gesture.

Keyboard behavior:

- The workspace canvas can hold DOM focus while inactive rows are focused at the
  scene level.
- `Tab` and `Shift+Tab` move canvas focus between focusable scene items.
- `Enter` activates the focused row/control.
- `Escape` cancels the active editor or clears focus/selection.
- `Space` toggles focused switches, buttons, and disclosure controls.
- Arrow keys navigate rows or delegate to the active editor when an editor owns
  focus.
- Typing on a focused text-like row may open its active text editor when that
  behavior is intentionally declared for the Param kind.
- When an overlay closes, DOM focus returns to the workspace canvas and the
  corresponding scene item remains the keyboard focus target when valid.

The interaction controller must fail loudly for unsupported interactions during
development. It must not silently fall back to old xyflow or dnd-kit behavior.

## Active Editor Overlay Strategy

DOM-backed editor overlays are allowed only while actively editing or choosing a
value that needs native/browser/editor behavior.

Allowed active editor sessions:

- CodeMirror overlay for active code editing.
- Native `input` or `textarea` overlay for text, password, number, and
  multiline text where appropriate.
- DOM combobox overlay for search/typeahead selection when a canvas popup is
  insufficient.
- Native color input overlay for arbitrary color selection.
- Native date/time input overlay where platform picker behavior is needed.

Allowed non-editor transient surfaces:

- Context menus and app-level popovers.

Overlay rules:

- Overlay placement is derived from scene geometry.
- At most one active editor session exists per workspace.
- A session may mount multiple DOM nodes internally when required.
- Inactive rows must never mount CodeMirror, native inputs, DOM comboboxes, or
  Param UI DOM.
- Overlays must not become the passive row renderer, layout engine, scroll
  owner, minimap owner, or pan/zoom implementation.
- Do not CSS-scale active text editors during zoom. Text metrics will diverge
  from the canvas and editing will feel wrong.

Context menus, canvas popups, and non-editor app popovers are transient
workspace surfaces, not active editor sessions.

Example shape:

```ts
type WorkspaceTransientSurface =
  | { kind: "active-editor"; session: ActiveEditorSession }
  | { kind: "context-menu"; target: ScenePath; rect: SceneRect }
  | { kind: "canvas-popup"; popup: CanvasPopupSession }
  | { kind: "app-popover"; target: ScenePath; rect: SceneRect };
```

The invariant is at most one active editor session. Other transient surfaces are
explicit and must not become passive row renderers, hidden legacy UI, or
DOM-owned workspace layout.

Viewport and invalidation policy must be deterministic per editor kind:

| Event | Text/input overlay | CodeMirror overlay | Combobox overlay | Color picker |
| --- | --- | --- | --- | --- |
| workspace pan | reposition if cheap | reposition or close | close | close |
| workspace zoom | commit/close or cancel by policy | commit/close | close | close |
| section scroll | reposition if row remains visible | close if clipped | close | close |
| row becomes invisible | commit or cancel by policy | commit or cancel by policy | cancel | cancel |
| project state invalidates row | close | close | close | close |

## Minimap

The minimap is part of the new workspace renderer.

Rules:

- Do not use `forks/xyflow/minimap`.
- Do not render minimap SVG nodes from xyflow state.
- Do not compute minimap from live section DOM.
- Derive minimap bounds, section previews, selected-section state, and viewport
  mask from the retained scene model.
- Default to drawing the minimap in the workspace renderer as a HUD on the same
  canvas. If a second physical canvas is introduced for technical reasons, it
  must still be driven by the same scene and interaction controller, and the
  reason must be documented near the implementation.

## Drag And Drop

dnd-kit is not part of the replacement workspace.

Section drag, reorder, grouping, reparenting, Param drag, Param reorder, nested
Param drag, and drop indicators must be implemented by:

- scene hit testing
- nested scene paths
- explicit drag state
- explicit section and Param drop target records
- deterministic drop target calculation for root and nested sections
- existing project mutation paths or new Go-owned mutation endpoints where
  needed

The existing dnd-kit package and helpers can remain in the repository only for
non-workspace UI that still uses them, such as unrelated controls. They must not
be imported by the workspace root, canvas scene, canvas renderer, workspace
interaction controller, or any passive in-workspace section renderer.

## Visual Parity Requirements

The canvas workspace should look close enough to the current `go-rewrite`
workspace that Settings `All Settings` feels like the same product.

Required anchors:

- section density, spacing, header height, and corner radius
- nested section placement, clipping, and parent/child spacing
- section chrome colors in light and dark mode
- Dict row heights and spacing
- label/value alignment
- nested Param indentation and rails
- typography, font sizes, and line heights
- row hover, active, error, focus, and selected states
- switch shape and checked/unchecked colors
- color swatches
- dropdown/combobox selected-value appearance
- text/code preview styling
- section scrollbars and clipped content behavior
- minimap placement, viewport mask, section shapes, and selected-section state
- drag, resize, and selection affordances

Do not redesign the workspace as part of this rewrite. Visual differences are
acceptable only when they are implementation noise, not a new product direction.

### Quantitative Visual Parity Gate

Visual parity is a pass/fail gate, not a prose screenshot note. A milestone that
claims visual parity must include deterministic reference captures, deterministic
current captures, machine-readable comparison results, and a short human review
summary under `perf/`.

Use a visual comparison harness that captures the same scenario in the clean
`go-rewrite` reference and the current canvas workspace. The harness must use:

- the same route, project, view mode, active tab, viewport, theme, and browser
  viewport size
- `1440x1200` and device scale factor `1` for the primary benchmark capture
- closed overview/UI-editor side panes and closed project chat windows in both
  the clean `go-rewrite` reference and the current canvas branch, unless a
  specific non-primary capture explicitly declares a different chrome state
- a deterministic saved viewport or explicit scene viewport before capture
- masks for branch name text, clocks, cursor, runtime-only notifications, and
  other intentionally variable chrome
- stable crop definitions for the workspace, minimap, representative sections,
  Dict rows, and individual controls

Before setting thresholds, capture the clean `go-rewrite` reference twice in the
same run and record natural recapture noise. Current-versus-reference thresholds
should be `max(fixed threshold, 3x go-rewrite recapture noise)` so the gate is
grounded in measured browser/rendering variance.

Hard failures:

- any required reference or current capture is missing
- reference and current capture dimensions differ
- the current workspace architecture probes fail, such as missing the single
  workspace canvas or mounting xyflow workspace DOM
- section bounds, row bounds, or minimap bounds cannot be extracted for
  anchor-based comparison
- the comparison report omits a required metric, crop, or threshold

Initial fixed thresholds for the Settings `All Settings` benchmark:

- full workspace SSIM: `>= 0.90`
- representative section crop SSIM: `>= 0.92`
- representative Dict row/control crop SSIM: `>= 0.92`
- mean absolute RGB delta for masked workspace crop: `<= 8`
- section rect `x`, `y`, `width`, and `height` delta at normal zoom: `<= 4px`
- Dict header height and row height delta: `<= 2px`
- label/value column alignment delta: `<= 3px`
- minimap bounds and viewport-mask IoU: `>= 0.95`
- minimap section preview count must match the reference unless an explicit
  minimap policy says otherwise

The Step 4 passive-renderer gate must cover passive states only:

- normal dark workspace
- light workspace
- zoomed-out overview
- minimap crop
- selected-section crop when selection is present in project state
- representative Dict row/control crops for text, switch, color swatch,
  dropdown selected value, nested row, code preview, and section scrollbar

Interaction and active-editor visual states belong to the later milestone gates,
but they are still required before the benchmark milestone is accepted:

- hovered row
- active editor
- dropdown/combobox popup
- color picker popup
- switch active/changed state
- error state
- drag, resize, and drop affordances

If a visual difference is intentionally accepted, document the reason and the
affected anchor in the parity report. Intentional differences must be narrow.
Broad differences in density, scale, colors, layout, or framing mean the gate
fails.

## Performance Rules

Primary rules:

- No xyflow in the active workspace.
- No dnd-kit in the active workspace.
- One workspace canvas/WebGPU surface for pan/zoom rendering.
- No DOM-owned pan/zoom interface.
- No passive section DOM for canvas-owned sections.
- No passive Param row DOM.
- No per-frame React reconciliation for section or row contents.
- No per-frame DOM layout measurement for canvas geometry.
- No CodeMirror instances for inactive rows.
- No syntax highlighting in the per-frame draw loop.
- Draw only visible Dict rows plus overscan.
- Cache deterministic geometry until project state, viewport, section scroll, or
  relevant theme/text inputs change.
- Cache text measurements by text, font, width, and theme.
- Cache passive code token runs by code hash, language, theme, preview limits,
  font, and preview width.
- Keep active DOM overlays minimal and explicit.
- No Settings-specific fast paths.

Important metrics:

- FPS during Settings `All Settings` pan/zoom.
- DOM node count in Settings `All Settings`.
- Canvas/WebGPU frame time.
- Scene derivation time after project state updates.
- Text measurement/cache hit rate.
- Section wheel-scroll frame time.
- Active editor open latency.
- Typing latency inside active editor.
- Commit latency from editor/control to updated canvas preview.

After baseline measurement, define concrete benchmark targets for average and
p95 pan/zoom frame time, DOM node count reduction, editor activation latency,
section wheel-scroll frame time, and passive code highlighting cache hit rate.

## Implementation Plan

### 1. Baseline From `go-rewrite`

- Run the Settings `All Settings` benchmark on the clean `go-rewrite` baseline.
- Record DOM node count, pan/zoom FPS, current minimap behavior, and current
  interaction behavior.
- Append the report under `perf/`.
- Capture visual references for:
  - normal dark mode
  - zoomed-out overview
  - light mode
  - hovered row
  - active editor
  - error state
  - dropdown/combobox
  - color picker
  - switch
  - minimap
  - section selection/drag/resize affordances
- For the primary workspace references, close the overview pane, UI editor pane,
  and any project chat windows or expanded bottom-dock chat content before
  capturing; use the same closed-chrome setup for both the `go-rewrite`
  references and current branch recaptures.
- Capture at least two deterministic `go-rewrite` reference passes for the
  quantitative visual parity gate's recapture-noise calibration.

### 2. Workspace Scene Model

- Add a frontend retained workspace scene derivation module.
- Derive viewport, project bounds, section bounds, section chrome/body
  geometry, minimap geometry, and interaction hit regions without DOM layout.
- Derive the section scene graph, including parent ids, child ordering, local
  bounds, world bounds, clip regions, and nested drop zones.
- Derive generic Dict section row records from existing project state and
  generated types.
- Flatten nested Dict Params into stable row records.
- Compute row rectangles, labels, passive values, control rectangles, nesting
  rails, errors, visible row range, and scrollbars.
- Define Param support declarations, active input strategies, commit modes, and
  hit-region intents for the first Dict Param kinds.
- Add active editor session state and transient canvas-active control state to
  the workspace controller model.
- Add passive code preview token-run fields and async highlight cache plumbing
  to the scene model.
- Add scene revision keys and cache invalidation keys for project, viewport,
  section scroll, theme, font, device pixel ratio, text measurement, and
  highlighter work.
- Keep section scroll offsets in frontend UI state.
- Add tests for:
  - viewport transform and coordinate conversion
  - section geometry
  - nested section scene paths
  - local-to-world section bounds
  - parent clip regions
  - nested drop zone derivation
  - minimap geometry
  - Dict flattening
  - non-Settings Dict fixtures
  - row geometry
  - visible row ranges and overscan
  - hit regions
  - hit-region intents
  - Param support declarations
  - active editor session transitions
  - passive code highlight cache keys
  - stale async result discard
- Do not import xyflow or dnd-kit from the scene model.

### 3. Single Canvas Workspace Shell

- Replace `UIPage`'s active workspace root with the new canvas workspace root.
- Remove `SectionDndContext` from the workspace root.
- Remove `ReactFlow` from the workspace root.
- Remove `ResponsiveMiniMap` and xyflow minimap from the workspace root.
- Add one full-workspace canvas/WebGPU surface.
- Add one overlay host above the canvas for active editors/popups.
- Handle CSS-pixel scene geometry, backing-store scaling, devicePixelRatio
  changes, ResizeObserver viewport resize, theme/font invalidation, and unmount
  cleanup.
- Wire viewport state to the new workspace controller, not xyflow.
- Add tests proving the active workspace no longer mounts xyflow, xyflow
  minimap, `SectionDndContext`, section DOM nodes for canvas-owned sections, or
  passive Dict row DOM.

### 4. Passive Renderer

- Render the full workspace scene onto the single canvas/WebGPU surface.
- Render section placement, section chrome, section bodies, and clipping.
- Render nested sections through the scene graph with parent clip stacks.
- Render Settings/Dict sections passively from scene data.
- Render visible Dict rows plus overscan.
- Render labels, passive values, errors, selected state, hover state, simple
  controls, and per-section scrollbars.
- Render inactive code previews from cached token runs when available, with a
  plain text fallback while async highlighting is pending.
- Add a passive code highlighter service using Lezer/CodeMirror highlighting or
  Shiki, depending on which best matches active-editor parity and preview
  quality needs.
- Discard stale async highlighter and text-measurement results using explicit
  revision/cache keys.
- Render minimap from the same scene model.
- Show explicit canvas placeholders for unsupported non-Dict section types until
  their renderers exist. Do not use xyflow as their fallback.
- Pass the Step 4 passive-renderer quantitative visual parity gate before
  continuing to interaction work. A single screenshot or prose comparison is not
  sufficient.

### 5. Workspace Interactions

- Implement direct pan and zoom.
- Implement minimap pan/zoom interactions.
- Implement section selection, multi-selection, drag, and resize.
- Implement nested section hit testing, selection, drag, resize, reorder, and
  reparent where supported by project mutations.
- Implement section body wheel scrolling and per-section scroll offsets.
- Define and implement mutation contracts for viewport persistence, section
  scroll, section drag/resize, section reorder/reparent, Param reorder,
  canvas-native controls, sliders, color edits, combobox selection, and
  text/code drafts before each interaction lands.
- Implement Dict row hit testing and hover/focus/selected state.
- Implement scene-level keyboard focus and navigation.
- Route all pointer/key behavior through declared hit-region intents.
- Implement simple canvas-native control interactions:
  - switch toggle
  - simple dropdown option selection
  - color swatch/choice selection where choices are fixed
  - slider/range drag where applicable
  - disclosure/button activation where applicable
- Keep canvas-native active controls entirely in the scene/controller, without
  mounting DOM.
- Commit through existing update paths or new Go-owned endpoints where needed.
- Re-render from project state, not local duplicated truth.

### 6. Active Editors And Popups

- Implement one overlay host above the canvas.
- Implement active editor session creation, draft state, commit, cancel, and
  close behavior.
- Implement explicit `WorkspaceTransientSurface` state for active editors,
  context menus, canvas popups, and app popovers.
- Add editor adapters for the initial overlay-backed Param kinds.
- Add native input overlay for short text, password, and typed number values.
- Add textarea overlay for multiline values where CodeMirror is unnecessary.
- Add CodeMirror overlay for code rows.
- Add DOM combobox overlay where typeahead is needed.
- Add native color input overlay where arbitrary color editing is needed.
- Add right-pane editing path for large or awkward values if needed.
- Enforce deterministic pan/zoom/scroll/project-invalidation policies per
  editor kind.
- Ensure inactive canvas rows do not mount editors.

### 7. Remove Workspace xyflow/dnd-kit Dependencies

- Remove active workspace imports from:
  - `forks/xyflow/*`
  - `forks/dnd-kit/*`
  - `@dnd-kit/*`
- Remove or retire workspace-only adapters that exist only to bridge xyflow and
  dnd-kit.
- Update tests that currently mock xyflow/dnd-kit workspace state to use the new
  workspace scene/controller state.
- Keep non-workspace dnd-kit usage only where it is unrelated to the canvas
  workspace and explicitly documented.

### 8. Performance And Hardening

- Re-run Settings `All Settings` benchmark.
- Record before/after FPS, DOM count, frame time, scene derivation time, and
  interaction latency under `perf/`.
- Add browser visual checks for Settings views.
- Add regression checks that the Settings workspace does not mount xyflow,
  xyflow minimap, section DOM, passive Param rows, or inactive CodeMirror
  editors.
- Add regression checks for at most one active editor session per workspace.
- Add performance checks for passive code highlighting cache behavior when code
  previews are visible.
- Add checks for devicePixelRatio/backing-store resize behavior and stale async
  result discard where practical.
- Verify large DOM counts do not reappear.

## Testing Plan

Unit tests:

- scene derivation from project state
- viewport transform and coordinate conversion
- minimap transform and hit testing
- section geometry and z/order
- nested section scene graph derivation
- nested local/world coordinate conversion
- parent clip stack behavior
- nested section drop target derivation
- Dict flattening from nested Param data
- non-Settings Dict fixtures
- row geometry and visible ranges
- row/control hit testing
- hit-region intent dispatch for viewport, sections, Dict rows, controls,
  minimap, and edge/port regions
- Param support declarations and activation contracts
- active input strategy selection
- commit/cancel mode behavior
- active editor session lifecycle
- scene-level keyboard focus/navigation
- section scroll state
- passive code highlighter cache keys and async fallback behavior
- stale async highlighter, measurement, and derivation result discard
- scene/cache revision key invalidation
- canvas CSS-pixel to backing-store scaling
- devicePixelRatio, ResizeObserver, theme, and font invalidation handling
- pointer capture release on cancel, blur, lost pointer, and unmount
- mutation contract begin/update/commit/cancel behavior
- canvas renderer draw command coverage with mocked canvas context
- interaction reducer/controller tests for pan, zoom, selection, drag, resize,
  row hover, section scroll, canvas-native controls, editor activation, and
  editor invalidation
- interaction reducer/controller tests for nested section selection, drag,
  resize, reorder, and reparent when those mutations are supported

Integration tests:

- `UIPage` mounts the canvas workspace root instead of xyflow.
- Settings `All Settings` renders through the canvas workspace path.
- The Settings workspace does not mount xyflow nodes/minimap.
- The Settings workspace does not mount passive section or Param row DOM.
- Wheel over a Dict section scrolls that section without moving the whole
  viewport unexpectedly.
- Switch changes persist and redraw.
- Canvas-native dropdown, fixed palette, slider, and disclosure interactions
  persist and redraw where those Param kinds exist.
- Dropdown/color changes persist and redraw.
- Text Param opens one active editor session and commits back to project state.
- Code Param opens one CodeMirror session and does not create inactive
  CodeMirror instances.
- Overlay-backed editors receive geometry from the scene model.
- Focus returns to the workspace canvas after an editor session closes.

E2E/browser verification:

- Settings `All Settings` pan/zoom visual check.
- Quantitative visual parity gate against `go-rewrite` references.
- Minimap visual and interaction check.
- Section selection, drag, and resize check.
- Nested section selection, drag, resize, and reparent check when nested section
  fixtures are available.
- Dict section scroll visual check.
- Active CodeMirror overlay visual and interaction check.
- Inactive code preview syntax highlighting visual check when code Params are
  visible.
- Combobox/color overlay check.
- Right-pane edit surface check if implemented.

Performance verification:

- Capture before/after reports under `perf/`.
- Include FPS, DOM node count, canvas/WebGPU frame time, editor activation
  latency, typing latency, and passive code highlighting cache behavior.
- Use chrome-devtools profiling when frame-time regressions are unclear.

## Acceptance Criteria

### Benchmark Milestone: Settings `All Settings`

- The active workspace no longer mounts xyflow.
- The active workspace no longer mounts the xyflow minimap.
- The active workspace no longer uses dnd-kit for section or Param
  interactions.
- The active workspace pan/zoom interface is owned by the canvas/WebGPU
  workspace controller.
- The active workspace renders through one canvas/WebGPU surface, not one canvas
  per section.
- The minimap is rendered from the retained scene model and does not depend on
  live section DOM, xyflow nodes, or SVG minimap nodes.
- Settings `All Settings` Dict sections render passively through the canvas
  workspace path.
- Passive Dict rows do not mount DOM rows, inactive CodeMirror instances,
  native input controls, DOM comboboxes, or Param UI component DOM.
- Inactive text/code/textarea, switch, color, dropdown, and combobox Params are
  rendered as canvas/WebGPU passive previews until activated.
- Inactive code previews can render syntax-highlighted token runs from a cached
  passive highlighter, with plain text fallback while highlighting is pending.
- Each editable Param kind in the benchmark has an explicit activation contract,
  active input strategy, commit mode, cancel behavior, keyboard behavior, and
  unsupported behavior.
- Supported benchmark interactions have explicit mutation contracts with
  begin/update/commit/cancel behavior where the interaction is continuous.
- Canvas-native active controls such as switches, fixed dropdowns, fixed
  palettes, sliders, buttons, and disclosures do not mount DOM.
- Overlay-backed text/code/combobox/color editors use one active editor session
  per workspace and keep draft state inside that session.
- Context menus, canvas popups, and app popovers are explicit transient
  workspace surfaces, not hidden passive renderers.
- Section placement, chrome, bodies, row layout, controls, scrollbars, hit
  testing, pan, and zoom use the retained scene model.
- Hit testing dispatches through declared hit-region intents.
- Hover, selection, scene keyboard focus, and active editor session state are
  represented as separate states.
- Scene geometry and hit testing use CSS pixels. Renderer backends handle
  backing-store/device-pixel scaling internally.
- Async highlighter, text measurement, and scene derivation results are
  discarded when their revision/cache keys are stale.
- No Settings-specific renderer code paths, hard-coded Settings ids, or
  benchmark-only fast paths are introduced.
- Settings `All Settings` passes the quantitative visual parity gate for the
  required passive, interaction, and active-editor reference states.
- Pan/zoom in Settings `All Settings` beats the current full DOM path by a large
  margin.
- Section-level scrolling works inside canvas-rendered Dict sections.
- Switches, color pickers, dropdowns/comboboxes, and text/code Params remain
  editable through canvas-native interaction, DOM overlay, or right-pane editing.
- Active CodeMirror editing uses one active editor session and does not
  reintroduce hundreds of editors.
- Pan, zoom, section scroll, row invisibility, and project invalidation follow
  deterministic editor close/reposition/commit/cancel policies.
- Focused tests pass.
- Browser visual verification and quantitative visual parity reports are
  completed for the Settings benchmark.
- Before/after performance notes are recorded under `perf/`.

### Full Workspace Acceptance

- Nested sections render through the same retained scene graph and canvas
  surface, with local/world bounds, clip stacks, and scene-path hit testing.
- Nested section selection, drag, resize, reorder, and reparent use canvas scene
  paths and explicit drop targets, not dnd-kit or nested DOM.
- Non-Dict section renderers replace placeholders through the retained scene
  model and single workspace surface.
- Complex custom Param editors are covered through canvas preview,
  canvas-native interaction, overlay-backed editing, or right-pane editing.
- Section reorder/reparent across supported parent/child regions has explicit
  mutation contracts, validation, cancel behavior, and undo grouping.
- Broader accessibility parity is implemented for canvas-rendered workspace
  content.
- WebGPU backend implementation, if added, preserves the same scene model,
  CSS-pixel geometry, hit testing, mutation contracts, and cache invalidation
  rules.

## Explicit Non-Goals

- Do not create one canvas per section.
- Do not create nested canvases or nested React section trees for nested
  sections.
- Do not keep xyflow alive under the canvas.
- Do not keep xyflow minimap alive under a new wrapper.
- Do not keep dnd-kit for workspace drag/drop.
- Do not use hidden DOM sections for passive rendering.
- Do not mount inactive input DOM in the workspace.
- Do not add backward-compatibility shims, legacy workspace support paths,
  migrations, transitional adapters, or silent compatibility fallbacks.
- Do not render existing HTML into textures.
- Do not hydrate DOM bodies on activation as the normal editing path.
- Do not add a Settings-only fast path.
