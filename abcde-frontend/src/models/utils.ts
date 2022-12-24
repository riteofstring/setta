import { NO_AUTH } from "utils/constants";
import _create, { StateCreator, StoreMutatorIdentifier } from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md
//https://github.com/pmndrs/zustand/issues/1494

const resetters: (() => void)[] = [];

export const create = <
  TState,
  Mos extends [StoreMutatorIdentifier, unknown][] = []
>(
  createState: StateCreator<TState, [], Mos>
) => {
  const slice = _create<TState, Mos>(createState);
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
