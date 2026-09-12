export type WorkspaceKeyBinding = Readonly<{
  id: string;
  chord: string | null;
}>;

export type WorkspaceKeyBindingDescriptor = Readonly<{
  id: string;
  label: string;
  chord: string | null;
  chordLabel: string | null;
  origin: "default" | "host";
}>;

export type WorkspaceKeyBindingConflict = Readonly<{
  chord: string;
  chordLabel: string;
  bindingIds: ReadonlyArray<string>;
  reservedGesture: string | null;
}>;
