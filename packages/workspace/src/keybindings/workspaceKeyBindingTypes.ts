// A host rebinds a workspace operation by naming the binding and the chord it should answer to.
// A null chord unbinds the operation, which is how a host frees a chord its own application needs.
export type WorkspaceKeyBinding = Readonly<{
  id: string;
  chord: string | null;
}>;

// What every binding currently answers to, including the operation's own label and the chord
// written for this platform, so a host can list or explain shortcuts without repeating them.
export type WorkspaceKeyBindingDescriptor = Readonly<{
  id: string;
  label: string;
  chord: string | null;
  chordLabel: string | null;
  origin: "default" | "host";
}>;

// Two bindings that answer to one chord, or a binding that would take a held interaction gesture's
// chord. `bindingIds` names every binding involved; `reservedGesture` names the gesture when the
// collision is with one.
export type WorkspaceKeyBindingConflict = Readonly<{
  chord: string;
  chordLabel: string;
  bindingIds: ReadonlyArray<string>;
  reservedGesture: string | null;
}>;
