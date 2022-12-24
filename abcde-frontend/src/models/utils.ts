import { NO_AUTH } from "utils/constants";
import _create, { StateCreator, StoreApi, UseBoundStore } from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md

const resetters: (() => void)[] = [];

export const create = <TState extends unknown>(
  createState: StateCreator<TState> | StoreApi<TState>
): UseBoundStore<StoreApi<TState>> => {
  // We need to use createState as never to support StateCreator<TState> and
  // StoreApi<TState> at the same time.
  // We also need to re-type slice to UseBoundStore<StoreApi<TState>>
  const slice: UseBoundStore<StoreApi<TState>> = _create(createState as never);
  const initialState = slice.getState();

  resetters.push(() => {
    slice.setState(getInitialStateForResetter(initialState), true);
  });

  return slice;
};

export const resetAllSlices = () => {
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
