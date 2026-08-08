# `@setta/workspace`

Private blank-slate implementation of the standalone Setta workspace package.

The package exposes the versioned recursive `WorkspaceDocument`, strict parsing and validation,
controlled and uncontrolled React ownership, granular edit capabilities, `readOnly`, and a stable
controller ref. The Phase 1 canvas shell uses exact-pinned upstream XYFlow behind an internal
adapter: root sections are derived projections, live viewport transforms remain transient, and one
completed viewport gesture publishes one document change.

```tsx
const controller = useRef<WorkspaceController>(null);

<Workspace
  controllerRef={controller}
  document={document}
  onDocumentChange={(nextDocument, change) => {
    setDocument(nextDocument);
    console.log(change.reason);
  }}
  capabilities={{ editStructure: canEditStructure }}
  gestureOptions={{
    minZoom: 0.5,
    maxZoom: 2,
    panOnScroll: true,
    zoomOnScroll: false,
  }}
/>;
```

Use `defaultDocument` instead of `document` for uncontrolled ownership. The two modes are mutually
exclusive, and a controlled workspace requires `onDocumentChange`. `readOnly` disables package-owned
layout, structure, and presentation edits while viewport navigation and arbitrary host-rendered
content remain available.

`gestureOptions` configures pan-on-drag, pan-on-scroll, wheel, pinch, double-click zoom, zoom bounds,
scroll direction and speed, and temporary activation keys without exposing XYFlow types. The
document viewport must be inside the configured bounds so a valid persisted viewport restores
exactly instead of being silently clamped.

Wrap interactive or scrollable content rendered inside the canvas with
`WorkspaceInteractionBoundary`. It independently suppresses canvas panning and wheel handling while
leaving the host control usable; consumers do not need to know the adapter's internal marker class
names.

Testing-only exports continue to exercise exact-pinned upstream XYFlow and dnd-kit behind
package-owned geometry, command, and interaction boundaries without making their types public.
