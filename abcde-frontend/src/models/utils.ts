import { NO_AUTH } from "utils/constants";
import { create as _create, StateCreator } from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

const resetters: (() => void)[] = [];
const projectResetters: (() => void)[] = [];
export const STATE_TYPES = {
  PROJECT_STATE: "PROJECT_STATE",
  BASE_STATE: "BASE_STATE",
} as const;

function createResetter(state) {
  const initialState = state.getState();
  return () => {
    state.setState(getInitialStateForResetter(initialState), true);
  };
}

export const create = (<T>(f: StateCreator<T> | undefined) => {
  if (f === undefined) {
    return create;
  }
  const store = _create(f);
  addResetter(store, STATE_TYPES.BASE_STATE);
  return store;
}) as typeof _create;

export const createProjectState = (<T>(f: StateCreator<T>) => {
  const store = create(f);
  addResetter(store, STATE_TYPES.PROJECT_STATE);
  return store;
}) as typeof _create;

export const resetStores = (stateType: keyof typeof STATE_TYPES) => {
  const resetterList = {
    [STATE_TYPES.PROJECT_STATE]: projectResetters,
    [STATE_TYPES.BASE_STATE]: resetters,
  }[stateType];

  for (const resetter of resetterList) {
    resetter();
  }
};

export function addResetter(state, stateType: keyof typeof STATE_TYPES) {
  if (stateType === STATE_TYPES.PROJECT_STATE) {
    projectResetters.push(createResetter(state));
  } else if (stateType === STATE_TYPES.BASE_STATE) {
    resetters.push(createResetter(state));
  }
}

function getInitialStateForResetter(initialState) {
  if (NO_AUTH && initialState["isAuthenticated"]) {
    return { ...initialState, isAuthenticated: false };
  }
  return initialState;
}
