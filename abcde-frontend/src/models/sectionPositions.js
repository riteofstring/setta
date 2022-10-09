import { action, thunk } from "easy-peasy";
import { resetState } from "models/utils";
import { PANEID } from "utils/constants";

function relativePos(sectionPositions, sectionId) {
  const sectionP = sectionPositions[sectionId];
  const paneP = sectionPositions[PANEID];
  return { y: sectionP.y - paneP.y, x: sectionP.x - paneP.x };
}

function getInitialState() {
  return {
    sectionPositions: {},
    positionUpdateRequested: {},
    positionUpdated: {},
    whoRequested: null,
  };
}

const sectionPositions = {
  ...getInitialState(),

  setSectionPosition: action((state, payload) => {
    const { sectionId, y, x } = payload;
    state.sectionPositions[sectionId] = { y, x };
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    const sectionPositions = helpers.getState().sectionPositions;
    const { sectionIds } = payload;
    return Object.assign(
      {},
      ...sectionIds.map((x) => ({ [x]: relativePos(sectionPositions, x) }))
    );
  }),

  setPositionUpdateRequested: action((state, payload) => {
    const { sectionIds, positionUpdateRequested } = payload;
    sectionIds.forEach(
      (x) => (state.positionUpdateRequested[x] = positionUpdateRequested)
    );
  }),

  setPositionUpdated: action((state, payload) => {
    const { sectionIds, positionUpdated } = payload;
    sectionIds.forEach((x) => (state.positionUpdated[x] = positionUpdated));
  }),

  setWhoRequested: action((state, payload) => {
    state.whoRequested = payload;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default sectionPositions;
