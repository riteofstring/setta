import { action, thunk } from "easy-peasy";
import _ from "lodash";

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
    state.x[sectionTypeId] = newSectionType;
    if (childTypeId) {
      const childType = newSectionType.childType;
      childType.id = childTypeId;
      if (childType instanceof SectionType) {
        state.x[childTypeId] = childType;
      }
    }
  }),

  reinitSectionType: thunk((actions, payload, helpers) => {
    const { sectionTypeId } = payload;
    const globalState = helpers.getStoreState();
    const allObjCollections = globalState.master.allObjCollections;
    const allParamCollections = globalState.master.allParamCollections;
    const sections = globalState.sectionInfos.x;
    setSelectedItemsToNull(sections, sectionTypeId, allObjCollections)

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



function setSelectedItemsToNull(sections, sectionTypeId, allObjCollections) {
  for (let section of _.values(sections)) {
    let doneSearch = false;
    if (
      section.selectedItem &&
      section.sectionTypeId === sectionTypeId &&
      !doneSearch
    ) {
      for (let colInfo of _.values(allObjCollections.children)) {
        if (!doneSearch && section.selectedItem in colInfo.children) {
          section.selectedItem = null;
          doneSearch = true;
        }
      }
    }
  }
}



// For childrenInfo, structure can be:
// sectionId: {sectionTypeName: {collectionIds: {selectedItem: [childrenInfo]}}}
