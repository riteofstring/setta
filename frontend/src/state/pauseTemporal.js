import { stateDict, STATE_TYPES } from "./utils";

export function pauseTemporal() {
  for (const s of stateDict[STATE_TYPES.PROJECT_STATE].statePointers) {
    if (s.temporal) {
      s.temporal.getState().pause();
    }
  }
}
