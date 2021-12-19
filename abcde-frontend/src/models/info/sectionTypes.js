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
    const { id, uiTypeCollectionId } = currSectionType;
    const { id: childTypeId, uiTypeCollectionId: childUITypeCollectionId } =
      currSectionType.childType;
    const newSectionType = new SectionType({
      id,
      allObjCollections,
      allParamCollections,
      paramUIType: uiType,
      paramUITypeConfig: uiTypeConfig,
      parentIsSection: true,
      uiTypeCollectionId,
    });
    state.x[sectionTypeId] = newSectionType;
    if (childTypeId) {
      const childType = newSectionType.childType;
      childType.id = childTypeId;
      childType.uiTypeCollectionId = childUITypeCollectionId;
      if (childType instanceof SectionType) {
        state.x[childTypeId] = childType;
      }
    }
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
