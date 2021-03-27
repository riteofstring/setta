import { thunk, action } from "easy-peasy";

const sectionPositions = {
  sectionPositions: {},

  setSectionPosition: action((state, payload) => {
    const { sectionId, position } = payload;
    console.log("sectionId, position", sectionId, position);
    state.sectionPositions[sectionId] = position;
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    const state = helpers.getState();
    const globalState = helpers.getStoreState();
    return state.sectionPositions[payload] * globalState.mapInteraction.scale;
  }),
};

export default sectionPositions;
