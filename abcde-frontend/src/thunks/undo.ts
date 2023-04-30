import { useStateVersion } from "models/stateVersion";
import { stateDict, STATE_TYPES } from "models/utils";

export function undoProjectState() {
  const version = useStateVersion.getState().version;
  if (version === 0) {
    return;
  }

  for (const s of stateDict[STATE_TYPES.PROJECT_STATE].statePointers) {
    const sVersion = s.getState().version;
    if (version === sVersion && s !== useStateVersion) {
      s.temporal.getState().undo();
    }
  }

  useStateVersion.temporal.getState().undo();
}

export function incrementStateVersion(statePointers) {
  for (const s of statePointers) {
    pauseThenResumeTemporal(s, () =>
      s.setState((state) => ({ version: state.version + 1 }))
    );
  }
  useStateVersion.getState().incrementVersion();
}

function pauseThenResumeTemporal(statePointer, callback) {
  statePointer.temporal.getState().pause();
  callback();
  statePointer.temporal.getState().resume();
}
