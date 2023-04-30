import { useStateVersion } from "models/stateVersion";
import { stateDict, STATE_TYPES } from "models/utils";

export function undoProjectState() {
  const version = useStateVersion.getState().version;
  if (version === 0) {
    return;
  }

  const matchedStates = [useStateVersion];
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE].statePointers) {
    const sVersion = s.getState().version;
    if (s.temporal && s !== useStateVersion && version === sVersion) {
      s.temporal.getState().undo(2);
      matchedStates.push(s);
    }
  }

  useStateVersion.temporal.getState().undo(2);
  incrementStateVersion(matchedStates);
}

function incrementStateVersion(statePointers) {
  const version = useStateVersion.getState().version;
  for (const s of statePointers) {
    if (s.temporal) {
      resumeThenPauseTemporal(s, () => s.setState({ version }));
      s.setState({ version: version + 1 });
    }
  }
}

function resumeThenPauseTemporal(statePointer, callback) {
  statePointer.temporal.getState().resume();
  callback();
  statePointer.temporal.getState().pause();
}

export function maybeIncrementProjectStateVersion(doIncrementVersion) {
  if (doIncrementVersion) {
    incrementStateVersion(stateDict[STATE_TYPES.PROJECT_STATE].statePointers);
  }
}
