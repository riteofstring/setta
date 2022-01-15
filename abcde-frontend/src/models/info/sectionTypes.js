import { SectionType } from "classes/sectionType";
import { action, thunk } from "easy-peasy";

import { exportState } from "./utils";

const sectionTypes = {
  x: {},

  setSectionType: action((state, payload) => {
    state.x = payload(state.x);
  }),

  _reinitSectionType: action((state, payload) => {
    const { name, sectionTypeId, sectionSpecs } = payload;
    const currSectionType = state.x[sectionTypeId];
    const { id, uiTypeCollectionId } = currSectionType;
    const { id: childTypeId, uiTypeCollectionId: childUITypeCollectionId } =
      currSectionType.childType;
    const newSectionType = new SectionType({
      id,
      name,
      uiTypeCollectionId,
      sectionSpecs,
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
    actions._reinitSectionType(payload);
    return helpers.getState().x[payload.sectionTypeId];
  }),

  export() {
    return exportState(this);
  },
};

export default sectionTypes;
