import { thunk, action } from "easy-peasy";
import { PANEID } from "../utils/constants";

const sectionPositions = {
  sectionPositions: {},
  positionUpdateRequested: {},
  positionUpdated: {},

  setSectionPosition: action((state, payload) => {
    const { sectionId, y, x } = payload;
    state.sectionPositions[sectionId] = { y, x };
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    const sectionP = helpers.getState().sectionPositions[payload];
    const paneP = helpers.getState().sectionPositions[PANEID];
    const y = sectionP.y - paneP.y;
    const x = sectionP.x - paneP.x;
    return { y: y, x: x };
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
