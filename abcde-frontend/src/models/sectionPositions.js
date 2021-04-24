import { thunk, action } from "easy-peasy";

const sectionPositions = {
  sectionPositions: {},
  positionUpdateRequested: {},
  positionUpdated: {},

  setSectionPosition: action((state, payload) => {
    const { sectionId, position } = payload;
    state.sectionPositions[sectionId] = position
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    return (
      helpers.getState().sectionPositions[payload] *
      helpers.getStoreState().mapInteraction.scale
    );
  }),

  setPositionUpdateRequested: action((state, payload) => {
    const { sectionId, positionUpdateRequested } = payload;
    state.positionUpdateRequested[sectionId] = positionUpdateRequested;
  }),

  setPositionUpdated: action((state, payload) => {
    const { sectionId, positionUpdated } = payload;
    state.positionUpdated[sectionId] = positionUpdated;
  }),
};

export default sectionPositions;
