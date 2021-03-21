import { thunk } from "easy-peasy";
import { getPositionOfSection } from "../utils/sectionIds";

const sectionSizes = {
  sectionSizes: {},
  mapScaleAtTimeOfRecording: {},

  setSectionSize: thunk((action, payload, helpers) => {
    const { sectionId, size } = payload;
    const state = helpers.getState();
    state.sectionSizes[sectionId] = size;
    state.mapScaleAtTimeOfRecording[
      sectionId
    ] = helpers.getStoreState().mapInteraction.scale;
  }),

  getCurrPositionOfSection: thunk((action, payload, helpers) => {
    const state = helpers.getState();
    const globalState = helpers.getStoreState();
    let scalingFactor = 1;
    let currScale = globalState.mapInteraction.scale;
    for (let sectionId of Object.keys(state.sectionSizes)) {
      scalingFactor = currScale / state.mapScaleAtTimeOfRecording[sectionId];
      state.sectionSizes[sectionId].height *= scalingFactor;
      state.sectionSizes[sectionId].width *= scalingFactor;
      state.mapScaleAtTimeOfRecording[sectionId] = currScale;
    }

    const currPage = globalState.master.currPage;
    const idHierarchy = globalState.master.idHierarchy[currPage];
    const isVisible = globalState.master.isVisible;
    const isShown = globalState.master.isShown;

    if (state.sectionSizes[payload]) {
      return getPositionOfSection(
        payload,
        idHierarchy,
        isVisible,
        isShown,
        state.sectionSizes
      );
    }
    return 0;
  }),
};

export default sectionSizes;
