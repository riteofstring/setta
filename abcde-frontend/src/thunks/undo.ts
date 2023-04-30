import { useStateVersion } from "models/stateVersion";
import { decrementStateVersion, stateDict, STATE_TYPES } from "models/utils";

export function undoProjectState() {
  const version = useStateVersion.getState().version;
  if (version === 0) {
    return;
  }

  for (const s of stateDict[STATE_TYPES.PROJECT_STATE].statePointers) {
    const sVersion = s.getState().version;
    if (version === sVersion) {
      s.temporal.getState().undo();
    }
  }

  decrementStateVersion(useStateVersion);
}
