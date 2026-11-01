import {
  parseWorkspaceChord,
  type ParsedWorkspaceChord,
} from "./workspaceChords.js";

type ReservedWorkspaceGesture = Readonly<{
  chord: ParsedWorkspaceChord;
  name: string;
}>;

function reserve(chord: string, name: string): ReservedWorkspaceGesture {
  return Object.freeze({ chord: parseWorkspaceChord(chord), name });
}

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
