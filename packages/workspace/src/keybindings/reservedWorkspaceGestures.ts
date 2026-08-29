import {
  parseWorkspaceChord,
  type ParsedWorkspaceChord,
} from "./workspaceChords";

// The chords the workspace's held interaction modes and quick info own outright. They are not
// bindings: they activate and release with the keys rather than running an operation once, and
// every one of them is an interaction the pointer shares (marquee, multi-select, pan, parameter
// drag, parameter selection, quick info). Listing them here gives binding registration one place
// to refuse a chord that would take a gesture's keys away from it.
type ReservedWorkspaceGesture = Readonly<{
  chord: ParsedWorkspaceChord;
  name: string;
}>;

function reserve(chord: string, name: string): ReservedWorkspaceGesture {
  return Object.freeze({ chord: parseWorkspaceChord(chord), name });
}

// The hold modes below are the chords `useCanvasKeyActivations` tracks directly; the quick info
// entries are the chords its tooltip handler consumes.
export const RESERVED_WORKSPACE_GESTURES = Object.freeze({
  marqueeSelection: reserve("Shift", "marquee selection"),
  multiSelection: reserve("Mod", "multi-selection and zoom activation"),
  panActivation: reserve("Space", "pan activation"),
  freeParameterDrag: reserve("Alt", "free parameter drag"),
  sortingParameterDrag: reserve("Mod + Alt", "parameter sorting drag"),
  parameterSelection: reserve("Mod + Shift", "parameter selection"),
  quickInfo: reserve("Q", "quick info"),
  quickInfoFreeze: reserve("Q + F", "quick info freeze"),
  quickInfoCopy: reserve("Q + C", "quick info copy"),
  quickInfoPreviousPage: reserve("Q + ArrowLeft", "quick info previous page"),
  quickInfoNextPage: reserve("Q + ArrowRight", "quick info next page"),
  dismiss: reserve("Escape", "dismiss and deselect"),
});

export function listReservedWorkspaceGestures(): ReadonlyArray<ReservedWorkspaceGesture> {
  return Object.values(RESERVED_WORKSPACE_GESTURES);
}
