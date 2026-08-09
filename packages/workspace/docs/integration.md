# Host integration

This guide covers the permanent boundary between `@setta/workspace` and a consuming React
application. Import runtime components from `@setta/workspace/react`, framework-neutral helpers
from `@setta/workspace/core`, and the required CSS once from `@setta/workspace/styles.css`.

## Document contract

`WorkspaceDocument<TSectionData>` is the only canonical package document:

```ts
type WorkspaceDocument<TSectionData> = {
  schemaVersion: 1;
  viewport: { x: number; y: number; zoom: number };
  rootSections: Array<{
    sectionId: string;
    position: { x: number; y: number };
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
        width: { mode: "fixed" | "content"; value: number };
        height: { mode: "fixed" | "content"; value: number };
      };
      presentation: {
        chrome: "default" | "compact" | "transparent" | "none";
        accentColor: string | null;
        tagColor: string | null;
      };
      data: TSectionData;
      childLayout: {
        orientation: "vertical" | "horizontal";
        overflow: "grow" | "scroll";
        sectionIds: string[];
      } | null;
    }
  >;
};
```

Only roots have free workbench positions. A nested section appears once in its immediate parent's
ordered `sectionIds`; there is no serialized `parentId`. Root order is persistent stacking order,
and each child list is logical sibling order. IDs are non-empty and unique, every section is placed
exactly once, containment is reachable and acyclic, dimensions and viewport values are finite, and
section payloads must be JSON-serializable without accessors or cycles.

Use `validateWorkspaceDocument` for unknown values, `parseWorkspaceDocument` for JSON text, and
`serializeWorkspaceDocument` before storage or export. Structural validation cannot know the host
schema for `data`: validate every payload and registered `kind` before narrowing the parsed
`WorkspaceDocument<unknown>` to an application type.

```ts
import {
  createEmptyWorkspaceDocument,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  type WorkspaceDocument,
} from "@setta/workspace/core";

type NoteData = Readonly<{ body: string }>;

function isNoteData(value: unknown): value is NoteData {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { body?: unknown }).body === "string"
  );
}

function parseNoteWorkspace(serialized: string): WorkspaceDocument<NoteData> {
  const parsed = parseWorkspaceDocument(serialized);
  if (Object.values(parsed.sections).some((section) => !isNoteData(section.data))) {
    throw new TypeError("The workspace contains an invalid note payload.");
  }
  return parsed as WorkspaceDocument<NoteData>;
}

const initialDocument = createEmptyWorkspaceDocument<NoteData>();
localStorage.setItem("notes-workspace", serializeWorkspaceDocument(initialDocument));
const restoredDocument = parseNoteWorkspace(localStorage.getItem("notes-workspace")!);
```

Treat storage reads, schema errors, quota failures, and rejected imports as host UI states. Keep the
last valid in-memory document when recovery fails. Persist appearance, grid visibility, snapping,
minimap visibility, and other host preferences separately unless the host deliberately embeds them
in its own project format.

## Controlled and uncontrolled ownership

Pass neither `document` nor `defaultDocument` for an empty uncontrolled workbench, or pass one
`defaultDocument` for an uncontrolled initial value. Controlled ownership requires both `document`
and `onDocumentChange`; the two ownership modes are mutually exclusive.

One completed package command proposes one immutable document and one `WorkspaceDocumentChange`
reason. Pointer previews, selection, measurements, and transient render lift do not call the
change handler per frame. A controlled host accepts a proposal by rendering it back. If it retains
the prior document, the package reconciles to canonical host state and reports the rejection where
the initiating UI has a pending workflow.

Section payload changes remain host-owned. `SectionRenderProps` provides the current `data`,
`sectionId`, resolved `appearance`, and resolved `readOnly` state; update the payload by producing a
new controlled document in the host. Durable renderer state belongs in `data` because minimizing a
section unmounts its host body.

## Capabilities and read-only state

Capability overrides default to `true`. `readOnly` resolves all three package capabilities to
`false` and wins over individual overrides.

| Capability         | Package actions it gates                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editLayout`       | Spatial movement, structural reorder/reparent, batch movement, resize, fixed/content transitions, container orientation and overflow, direct lock changes, and persistent stacking. |
| `editStructure`    | Section creation, deletion, grouping, ungrouping, and the package-owned external-drop handoff.                                                                                      |
| `editPresentation` | Title edits, minimize/expand, chrome, accent, and tag changes.                                                                                                                      |

Selection, focus, fit, minimap navigation, pan, and zoom remain available. The package cannot make
arbitrary host-rendered controls read-only; use the `readOnly` render prop to enforce the host's
content policy. Authorization and persistence remain authoritative in the application even though
the package prevents locally unavailable gestures before they start.

## Registry, creation, and smart placement

Every populated document kind needs exactly one `SectionDefinition`. The definition declares frame
defaults, creation metadata, containment and size support, and the host component. The optional
`sectionFactory` owns stable ID allocation and payload creation; registering it enables the built-in
Add section control and searchable picker.

Toolbar creation calls `controller.createSection(kind)` and searches visible non-overlapping space.
Right-click creation supplies the pointer's workbench position. An explicit
`controller.createSection(kind, { position })` always wins over smart placement. For host-owned
placement outside React, `planWorkspaceSectionPlacement` accepts root rectangles, viewport bounds,
new size, padding, and an optional grid, then returns a deterministic `position` and optional
`panTarget` without mutating a document.

Search covers display name, kind, group, and keywords. A successful package creation selects and
focuses the new frame. The host owns additional creation items, asynchronous domain work, and any
payload validation.

## Toolbar and overlay extensions

`toolbarControls` covers the common native-button case. IDs must be unique and cannot shadow a
built-in control. A descriptor supplies `project`, `viewport`, or `utility` placement, an accessible
`label`, decorative `icon`, optional `pressed` and `disabled` state, and an `onPress` callback that
receives the public controller.

Use `overlaySlots` for richer project, viewport, utility, or transformed canvas content. Each slot
is a render function receiving the same controller. Fixed overlays isolate pointer and wheel input
from the viewport. Wrap interactive transformed content in `WorkspaceInteractionBoundary` when it
must suppress pan, wheel, or external-drop handling. Direct `Workspace` children are not an overlay
contract, and neither extension surface receives an internal store.

## Controller commands

The controller is unavailable until the upstream viewport initializes. Read it through
`controllerRef` after mount. Synchronous commands return `WorkspaceActionResult` with `applied`,
`unchanged`, or a specific `rejected` reason; measurement-dependent navigation returns a promise of
the same result.

| Area                    | Public methods                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Read state              | `getDocument`, `getCapabilities`, `getSelectedSectionIds`, `getHistoryState`                                          |
| Selection               | `selectSections`, `clearSelection`                                                                                    |
| Creation and structure  | `createSection`, `deleteSections`, `groupSections`, `ungroupSection`                                                  |
| Frame state             | `setSectionTitle`, `setSectionPresentation`, `setSectionsLocked`, `setSectionMinimized`, `setSectionChildOrientation` |
| Viewport and navigation | `setViewport`, `focusSection`, `fitSection`, `fitSections`, `focusNextSection`, `focusPreviousSection`                |
| Stacking                | `bringToFront`, `bringForward`, `sendBackward`, `sendToBack`                                                          |
| History                 | `undo`, `redo`                                                                                                        |

`focusSection` selects and focuses the requested frame while preserving zoom. Fit helpers wait for
measured frame geometry, enforce configured zoom bounds, and accept non-negative padding.
Next/previous navigation orders roots spatially, then follows canonical descendants. Do not infer
completion from timeouts; await the returned promise.

## Selection, grouping, stacking, and history

Selection is transient package state. A normal selection replaces it; Shift toggles membership;
Shift-drag on blank canvas performs partial or full marquee selection according to
`selectionOptions`; Control/Command+A selects all. Structural commands normalize away a selected
descendant when its ancestor is also selected.

Supplying `groupFactory` enables grouping for at least two selected siblings with one parent. The
host supplies the container kind, ID, title, and payload; the package owns insertion, canonical
order, and resulting selection. Mixed-parent grouping is rejected. Ungroup promotes direct
children at the same parent index; root ungrouping resolves non-overlapping root positions from
measured geometry.

Ordinary selection and dragging only lift the active top-level ancestor transiently. Persistent
stacking commands map any selected descendants to distinct root ancestors and change root order as
one undoable command. Batch lock, unlock, deletion, grouping, ungrouping, movement, and stacking use
normalized selection roots.

Committed section changes participate in built-in in-memory history; viewport and selection do
not. Controlled rejection does not consume an entry, a new accepted branch clears redo, and an
unrelated controlled document replacement clears both stacks. Hosts that need durable or
cross-domain history should own that larger transaction boundary.

## Minimap

The minimap projects roots because they are the spatial workbench objects. It is visible on the
right by default and may be hidden or placed on either physical side. Pointer navigation can center
an empty minimap point, pan the viewport, or select and focus a root summary. The toolbar and public
focus/fit/navigation methods provide equivalent non-minimap paths.

`minimapOptions.visible` is locally toggleable when `onMinimapVisibilityChange` is omitted. Passing
that callback makes visibility controlled; keep the ownership mode stable for the mount. The same
rule applies to `gridOptions.snap` and `onGridSnapChange`.

## External drops

`onExternalDrop` enables a generic browser boundary, not a file importer. The request includes the
original `DataTransfer`, a safe metadata snapshot, client and workbench coordinates, and the deepest
measured candidate parent plus orientation-aware insertion index. `validateExternalDrop` is an
optional synchronous, side-effect-free preview policy that returns a labeled acceptance or a
specific rejection.

Read custom transfer strings or capture `File` references synchronously before starting
asynchronous work. The host decides whether to create a section, import data, or reject the drop.
The package never identifies file types, uploads, accesses the filesystem, or maps MIME data to a
section. Use `WorkspaceInteractionBoundary preventExternalDrop` around a nested host surface that
owns native drops itself.
