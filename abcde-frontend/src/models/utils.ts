import { NO_AUTH } from "utils/constants";
import { create as _create, StateCreator } from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

const resetters: (() => void)[] = [];

export const create = (<T>(f: StateCreator<T> | undefined) => {
  if (f === undefined) {
    return create;
  }
  const store = _create(f);
  const initialState = store.getState();
  resetters.push(() => {
    store.setState(getInitialStateForResetter(initialState), true);
  });
  return store;
}) as typeof _create;

export const resetAllStores = () => {
  for (const resetter of resetters) {
    resetter();
  }
};

function getInitialStateForResetter(initialState) {
  if (NO_AUTH && initialState["isAuthenticated"]) {
    return { ...initialState, isAuthenticated: false };
  }
  return initialState;
}
