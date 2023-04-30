import { stateDict, STATE_TYPES } from "models/utils";

function resetStores(stateType: keyof typeof STATE_TYPES) {
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
