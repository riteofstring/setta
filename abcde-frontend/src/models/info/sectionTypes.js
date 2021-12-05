import { action, thunk } from "easy-peasy";

import { SectionType } from "../../classes/sectionType";
import { exportState } from "./utils";

const sectionTypes = {
  x: {},

  setSectionType: action((state, payload) => {
    state.x = payload(state.x);
  }),

  _reinitSectionType: action((state, payload) => {
    const {
      sectionTypeId,
      uiType,
      uiTypeConfig,
      allObjCollections,
      allParamCollections,
    } = payload;
    const currSectionType = state.x[sectionTypeId];
    const { id } = currSectionType;
    const childTypeId = currSectionType.childType.id;
    const newSectionType = new SectionType({
      id,
      allObjCollections,
      allParamCollections,
      paramUIType: uiType,
      paramUITypeConfig: uiTypeConfig,
      parentIsSection: true,
    });
    newSectionType.childType.id = childTypeId;
    state.x[sectionTypeId] = newSectionType;
    state.x[childTypeId] = newSectionType.childType;
  }),

  reinitSectionType: thunk((actions, payload, helpers) => {
    const allObjCollections = helpers.getStoreState().master.allObjCollections;
    const allParamCollections =
      helpers.getStoreState().master.allParamCollections;
    actions._reinitSectionType({
      allObjCollections,
      allParamCollections,
      ...payload,
    });
  }),

  export() {
    return exportState(this);
  },
};

export default sectionTypes;
