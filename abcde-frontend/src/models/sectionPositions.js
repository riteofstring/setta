import { thunk, action } from "easy-peasy";

const sectionPositions = {
  sectionPositions: {},
  positionUpdateRequested: {},
  positionUpdated: {},

  setSectionPosition: action((state, payload) => {
    const { sectionId, y, x } = payload;
    state.sectionPositions[sectionId] = { y, x };
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    const p = helpers.getState().sectionPositions[payload];
    const scale = helpers.getStoreState().mapInteraction.scale;
    return { y: p.y * scale, x: p.x * scale };
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
