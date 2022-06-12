import { thunk, action } from "easy-peasy";
import { PANEID } from "utils/constants";

function relativePos(sectionPositions, sectionId, absolute) {
  const sectionP = sectionPositions[sectionId];
  if (absolute) {
    return sectionP;
  }
  const paneP = sectionPositions[PANEID];
  return { y: sectionP.y - paneP.y, x: sectionP.x - paneP.x };
}

const sectionPositions = {
  sectionPositions: {},
  positionUpdateRequested: {},
  positionUpdated: {},
  whoRequested: null,

  setSectionPosition: action((state, payload) => {
    const { sectionId, y, x } = payload;
    state.sectionPositions[sectionId] = { y, x };
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    const sectionPositions = helpers.getState().sectionPositions;
    const { sectionId, sectionIds, absolute } = payload;
    if (sectionIds) {
      return sectionIds.map((x) => relativePos(sectionPositions, x, absolute));
    } else {
      return relativePos(sectionPositions, sectionId, absolute);
    }
  }),

  setPositionUpdateRequested: action((state, payload) => {
    const { sectionId, sectionIds, positionUpdateRequested } = payload;
    if (sectionIds) {
      sectionIds.forEach(
        (x) => (state.positionUpdateRequested[x] = positionUpdateRequested)
      );
    } else {
      state.positionUpdateRequested[sectionId] = positionUpdateRequested;
    }
  }),

  setPositionUpdated: action((state, payload) => {
    const { sectionId, sectionIds, positionUpdated } = payload;
    if (sectionIds) {
      sectionIds.forEach((x) => (state.positionUpdated[x] = positionUpdated));
    } else {
      state.positionUpdated[sectionId] = positionUpdated;
    }
  }),

  setWhoRequested: action((state, payload) => {
    state.whoRequested = payload;
  }),
};

export default sectionPositions;
