# `@setta/workspace`

Private blank-slate implementation of the standalone Setta workspace package.

The package now exposes the versioned recursive `WorkspaceDocument`, strict parsing and validation,
controlled and uncontrolled React ownership, granular edit capabilities, `readOnly`, and a stable
controller ref. The controller currently commits viewport, section lock, minimize, and subtree
deletion commands through one capability-aware reducer; later Phase 1 canvas work will use the same
boundary.

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
/>;
```

Use `defaultDocument` instead of `document` for uncontrolled ownership. The two modes are mutually
exclusive, and a controlled workspace requires `onDocumentChange`. `readOnly` disables package-owned
layout, structure, and presentation edits while viewport navigation and arbitrary host-rendered
content remain available.

Testing-only exports continue to exercise exact-pinned upstream XYFlow and dnd-kit behind
package-owned geometry, command, and interaction boundaries without making their types public.
