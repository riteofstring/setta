# Realtime drawing capabilities implementation plan

Status: in progress

## Outcome

The Realtime drawing section should become a capable retained-object sketching and annotation
surface without changing the authority model that already makes drawing, resizing, history, and
runtime snapshots reliable. Fabric.js continues to own object interaction and serialization. Setta
continues to own the logical canvas, durable gesture boundaries, history, project settlement, and
snapshot delivery.

This implementation adds:

- text boxes, lines, arrows, rectangles, and ellipses;
- pen and translucent highlighter presets;
- contextual appearance and typography controls in the right-side Inspector;
- duplicate, delete, layer ordering, alignment, distribution, grouping, ungrouping, and object
  locking;
- drawing-scoped copy, paste, select-all, undo, redo, nudging, grouping, and deletion shortcuts;
- explicit zoom, fit, 100%, and hand-pan controls; and
- a non-exported optional grid with logical-coordinate snapping.

The tool remains one drawing section rather than a separate illustration application. The top
toolbar selects tools and view actions; object properties and structural actions belong in the
Inspector.

## Interaction model

The toolbar is organized into four compact groups:

1. Select, Pen, Highlighter, Eraser, and Hand tools.
2. Insert Text, Line, Arrow, Rectangle, and Ellipse actions.
3. Pen or highlighter color and width controls when either freehand tool is active.
4. Undo, Redo, zoom out, fit, 100%, zoom in, and Clear.

New objects appear within the visible logical canvas, become selected, and create one history entry
and one durable settlement. A new text box immediately enters Fabric text editing. Line and arrow
objects are ordinary Fabric built-ins, not custom serialized classes. Highlighter paths use the
chosen color with a stable translucent alpha and a wider retained stroke.

The drawing stage is focusable. Once a user interacts with it, drawing-owned shortcuts stop before
Workspace's document bindings:

- Mod-Z and Shift-Mod-Z perform drawing undo and redo;
- Ctrl-Y performs redo where customary;
- Mod-C, Mod-V, and Mod-D copy, paste, and duplicate drawing objects;
- Mod-A selects all drawing objects;
- Mod-G and Shift-Mod-G group and ungroup;
- Delete and Backspace delete the drawing selection;
- arrow keys nudge by one logical pixel, or ten with Shift; and
- Escape clears the Fabric selection without deselecting the outer section.

Fabric's hidden text editor retains ordinary text-editing keys and clipboard behavior. Shortcuts
that cannot act on drawing state fall through rather than masking Workspace behavior.

## Contextual Inspector

Realtime extends its existing app-owned drawing surface registry into a lifecycle-safe external
store. Each Workspace host and section ID has one slot containing the mounted drawing controller,
a stable immutable snapshot, and subscribers. The Inspector can therefore mount before the Fabric
surface, survive minimization, and update from selection changes without placing Fabric objects in
React or Workspace state.

The Inspector shows a Selection panel above the existing Drawing canvas panel. No selection shows
a brief instruction. A selection exposes only properties supported by all applicable objects:

- fill enablement and color;
- stroke enablement, color, and width;
- opacity;
- system font family, size, style, and alignment for text;
- corner radius for rectangles; and
- transform lock state.

Mixed selections present mixed values rather than borrowing one object's value. Changing a mixed
property applies the chosen value to every compatible selected object. Images, if a future asset
contract adds them, would expose opacity and arrangement without pretending to support vector fill
or typography.

Arrange actions include forward, backward, front, back, six edge or center alignments, horizontal
and vertical distribution, duplicate, group, ungroup, lock or unlock, and delete. Multi-object
actions preserve relative stacking order and settle once. Locked objects remain selectable so they
can be unlocked, but geometry-changing and destructive actions do not bypass their lock.

## Runtime and history

`RealtimeDrawingRuntime` remains the only mutation authority for Fabric state. It publishes stable
primitive snapshots for the Inspector and routes every toolbar, Inspector, keyboard, and pointer
mutation through the existing preview and settled callbacks.

Selection, active tool, clipboard, zoom, pan, grid visibility, and grid snapping are disposable
browser state and never enter the Fabric scene or project document. Created objects, object styles,
stack order, groups, lock fields, and logical positions are retained scene state.

Each coherent command produces at most one new full-document history entry. Loading, undo, redo,
and delayed canonical acknowledgement must not manufacture entries. Async clone and paste commands
must verify that their source runtime and selection are still current before installing results.
Text changes preview while editing and settle once when editing exits.

## Viewport, grid, and Workspace coexistence

Drawing zoom and hand pan are CSS presentation transforms on Fabric's wrapper, not Fabric viewport
transforms. The retained scene and Fabric raster exports therefore remain in full logical-canvas
coordinates. Fit mode recomputes the contain scale when the section changes size. 100% means one
CSS pixel per logical pixel. Zoom is bounded and reset remains available.

Bare wheel input over the drawing continues to pan the outer Workspace, preserving the established
canvas interaction contract. Inner navigation uses explicit toolbar controls and the Hand tool.
Hand panning and zooming do not change the project revision, drawing scene, history, logical canvas
size, or outer Workspace viewport.

The optional grid is rendered as a DOM/SVG overlay between Fabric's lower and upper canvases. It
uses logical canvas coordinates, follows fit and zoom transforms, and is absent from preview and
final raster output. Snap-to-grid adjusts a moved object's logical position during the gesture; the
existing `object:modified` boundary settles the final placement once.

## Explicit exclusions

Variable-width pressure is not implemented in this plan. Fabric 7.4's supported `PencilBrush`
retains one uniform stroke width; changing it during movement would falsely appear pressure-aware
while serializing only the final uniform width. Real pressure requires a separately designed custom
outlined-path brush and retained geometry tests.

Image insertion is not implemented against the current runtime content upload. Those references are
invocation-scoped and their files are deleted when the server closes, while native Fabric image
serialization can embed an ephemeral absolute URL or a data URL. Durable drawing images require a
separate content-addressed project asset store, strict image validation, relative asset hydration,
project-reference validation, and orphan reconciliation. A dedicated image section also remains
outside this plan.

Smart snapping to other object edges and temporary alignment guides are excluded from this first
increment. Grid snapping and explicit alignment commands provide deterministic precision without
adding pointer-rate React state or exporting guides into snapshots.

## Implementation batches and commits

### Batch 1: plan

1. Record the complete interaction, authority, scope, and verification contract in this plan.
2. Commit the plan before governed source changes.

### Batch 2: retained objects and selection commands

1. Add text, line, arrow, and highlighter behavior using Fabric built-ins.
2. Add stable selection snapshots and object appearance, typography, locking, arrange, alignment,
   distribution, grouping, duplication, clipboard, selection, and nudge commands.
3. Preserve one settled/history boundary per command and complete focused runtime tests.

Commit the runnable Fabric runtime milestone.

### Batch 3: external store and contextual Inspector

1. Replace the resize-only registry with a lifecycle-safe surface external store.
2. Add a dedicated object Inspector component and retain the existing canvas-size panel.
3. Cover registration lifecycle, unavailable state, mixed values, conditional fields, and exact
   action delegation.

Commit the live Inspector milestone.

### Batch 4: toolbar, shortcuts, and creation workflow

1. Reorganize the toolbar, add new tools and insertion actions, and preserve compact wrapping.
2. Establish the drawing focus and keyboard boundary without intercepting Fabric text editing.
3. Update browser acceptance for representative creation, styling, grouping, keyboard, history,
   and outer-section ownership behavior.

Commit the complete object-authoring workflow.

### Batch 5: local viewport and precision

1. Add bounded CSS zoom, fit, 100%, explicit hand panning, and visible zoom state.
2. Add the non-exported grid overlay and optional snap-to-grid.
3. Prove view operations are disposable, exports remain full-canvas, bare wheel still pans
   Workspace, and grid movement settles once.

Commit the viewport and precision milestone.

### Batch 6: durable documentation and delivery

1. Update the Realtime README and mapped frontend rationale to describe the finished behavior and
   intentional exclusions.
2. Remove stale or duplicated drawing guidance.
3. Delete this temporary plan document.
4. Format changed files, run focused checks during development, commit the final documentation
   cleanup, and run the single required merge gate on the stable candidate.

## Verification

Focused runtime tests must prove:

- all new built-in object types survive scene and history round trips;
- highlighter alpha and width are retained;
- selection snapshots distinguish empty, uniform, mixed, grouped, text, and locked states;
- style, arrange, align, distribute, group, ungroup, lock, duplicate, paste, and nudge commands each
  settle once and undo coherently;
- async clone and paste cannot install stale results;
- text previews during editing and settles on exit; and
- zoom, pan, and grid remain absent from scene JSON and raster output.

Focused Inspector and registry tests must prove:

- host and section slots are isolated and registration lifecycle is observable;
- snapshots remain referentially stable until semantic state changes;
- the Inspector handles unavailable, empty, single, mixed, multi, grouped, and locked selections;
- only compatible appearance and typography controls appear; and
- every enabled control delegates the exact public drawing command.

Browser acceptance must prove one representative end-to-end path: create retained objects, edit
text, change style through the Inspector, duplicate and group with drawing-scoped shortcuts, undo
and redo, zoom and hand-pan without a project mutation, show and use grid snapping, then resize the
logical canvas and outer section with existing behavior intact. It must continue to prove that a
bare wheel over the drawing pans Workspace.

## Completion criteria

- The drawing toolbar supports selection, pen, highlighter, eraser, hand navigation, text, line,
  arrow, rectangle, and ellipse workflows.
- The right-side Inspector provides live contextual properties and complete object arrangement
  actions without persisting Fabric selection.
- Drawing shortcuts cannot accidentally invoke Workspace section commands while the drawing owns
  focus, and Fabric text editing remains native.
- Every retained mutation is undoable, durable, and settled exactly once.
- Zoom, pan, and grid are local presentation state and never change runtime snapshots or exports.
- Existing resize, delayed-snapshot authority, completion-paced preview, and outer Workspace
  interaction tests remain green.
- Durable docs describe actual behavior and exclusions, and this plan is deleted before delivery.
