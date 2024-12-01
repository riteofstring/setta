import _ from "lodash";
import { useSettings, useStateVersion } from "state/definitions";
import { stateDict, STATE_TYPES } from "state/utils";
import { saveProject } from "./project/saveProject";

export function undoProjectState() {
  const pastStates = useStateVersion.temporal.getState().pastStates;
  console.log("pastStates.length", pastStates.length);
  // if (pastStates.length <= 1) {
  //   return;
  // }

  const version = useStateVersion.getState().version;
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE]) {
    if (s.temporal) {
      console.log("s.temporal.pastStates", _.cloneDeep(s.temporal.getState().pastStates))
      s.temporal.getState().undo();
      // undoSetPastAndFutureStates(s);
    }
  }

  for (const s of stateDict[STATE_TYPES.PROJECT_STATE]) {
    if (s.temporal) {
      console.log("curr state after undo", _.cloneDeep(s.getState()))
      // const numUndo = 2;
      // s.temporal.getState().undo();
      // undoSetPastAndFutureStates(s);
    }
  }
  // autoSave();
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
  console.log("incrementStateVersion");
  for (const s of states) {
    if (s.temporal) {
      // s.setState({ version: version + 1 });
      resumeThenPauseTemporal(s, () => s.setState({})); //trigger a zundo update without actually changing state
      // console.log("incrementStateVersion: s.temporal.pastStates", _.cloneDeep(s.temporal.getState().pastStates))
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

const autoSave = _.debounce(() => {
  if (useSettings.getState().autosave) {
    saveProject();
  }
}, 1000);
