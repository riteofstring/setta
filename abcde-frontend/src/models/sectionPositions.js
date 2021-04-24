import { thunk, action } from "easy-peasy";

const sectionPositions = {
  sectionPositions: {},

  setSectionPosition: action((state, payload) => {
    const { sectionId, position, height } = payload;
    let prevHeight = 0;
    if (state.sectionPositions[sectionId]) {
      prevHeight = state.sectionPositions[sectionId].height;
    }
    state.sectionPositions[sectionId] = { position, height };
    console.log(
      "sectionId, prevHeight, newHeight",
      sectionId,
      prevHeight,
      height
    );
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    return (
      helpers.getState().sectionPositions[payload].position *
      helpers.getStoreState().mapInteraction.scale
    );
  }),
};

export default sectionPositions;
