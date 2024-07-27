import { stateDict, STATE_TYPES } from "state/definitions/utils";

function resetStores(stateType) {
  for (const resetter of stateDict[stateType].resetters) {
    resetter();
  }
}

export function resetAllStores() {
  resetStores(STATE_TYPES.BASE_STATE);
}

export function resetProjectStores() {
  resetStores(STATE_TYPES.PROJECT_STATE);
}
