import { useStateVersion } from "state/definitions";
import { stateDict, STATE_TYPES } from "state/utils";

export function undoProjectState() {
  const pastStates = useStateVersion.temporal.getState().pastStates;
  if (pastStates.length <= 1) {
    return;
  }

  const version = useStateVersion.getState().version;
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE]) {
    if (s.temporal && version === s.getState().version) {
      s.temporal.getState().undo(2);
      undoSetPastAndFutureStates(s);
    }
  }
  autoSave();
}

function undoSetPastAndFutureStates(s) {
  s.temporal.setState((state) => ({
    pastStates: [...state.pastStates, s.getState()],
    futureStates: filterPastOrFutureStates(state.futureStates),
  }));
}

function filterPastOrFutureStates(states) {
  const output = [];
  const versions = new Set();
  for (const f of states) {
    if (!versions.has(f.version)) {
      output.push(f);
      versions.add(f.version);
    }
  }
  return output;
}

export function redoProjectState() {
  const version = useStateVersion.getState().version;
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE]) {
    if (s.temporal && version === s.getState().version) {
      s.temporal.getState().redo();
      redoSetPastAndFutureStates(s);
    }
  }
  autoSave();
}

function redoSetPastAndFutureStates(s) {
  s.temporal.setState((state) => ({
    pastStates: filterPastOrFutureStates([...state.pastStates, s.getState()]),
  }));
}

function incrementStateVersion(states) {
  const version = useStateVersion.getState().version;
  for (const s of states) {
    if (s.temporal) {
      s.setState({ version: version + 1 });
      resumeThenPauseTemporal(s, () => s.setState({})); //trigger a zundo update without actually changing state
    }
  }
}

function resumeThenPauseTemporal(statePointer, callback) {
  statePointer.temporal.getState().resume();
  callback();
  statePointer.temporal.getState().pause();
}

export function maybeIncrementProjectStateVersion(
  doIncrementVersion,
  doAutoSave = true,
) {
  if (doIncrementVersion) {
    incrementStateVersion(stateDict[STATE_TYPES.PROJECT_STATE]);
    if (doAutoSave) {
      autoSave();
    }
  }
}

// const autoSave = _.debounce(saveProject, 1000);
const autoSave = () => {};
