import { thunk, action } from "easy-peasy";

const sectionPositions = {
  sectionPositions: {},

  setSectionPosition: action((state, payload) => {
    const { sectionId, position } = payload;
    console.log("sectionId, position", sectionId, position);
    state.sectionPositions[sectionId] = position;
  }),

  getCurrPositionOfSection: thunk(async (action, payload, helpers) => {
    while (helpers.getState().sectionPositions[payload] === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return (
      helpers.getState().sectionPositions[payload] *
      helpers.getStoreState().mapInteraction.scale
    );
  }),
};

export default sectionPositions;
