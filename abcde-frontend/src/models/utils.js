import _create from "zustand";

//https://github.com/pmndrs/zustand/blob/main/docs/guides/how-to-reset-state.md

const resetters = [];

export const create = (createState) => {
  const slice = _create(createState);
  const initialState = slice.getState();

  resetters.push(() => {
    slice.setState(initialState, true);
  });

  return slice;
};

export const resetAllSlices = () => {
  for (const resetter of resetters) {
    resetter();
  }
};
