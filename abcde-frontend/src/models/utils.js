import { NO_AUTH } from "utils/constants";
import _create from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md

const resetters = [];

export const create = (createState) => {
  const slice = _create(createState);
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
