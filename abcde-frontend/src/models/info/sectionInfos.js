import { action, computed, thunk } from "easy-peasy";
import _ from "lodash";
import { PANEID } from "utils/constants";
import { createNewId } from "utils/utils";

import { exportState } from "./utils";

function setDefaultChildrenInfo(state, childrenInfoId) {
  if (!(childrenInfoId in state.childrenInfo)) {
    state.childrenInfo[childrenInfoId] = [];
  }
  return state.childrenInfo[childrenInfoId];
}

const sectionInfos = {
  x: {},
  idsOverview: {},
  childrenInfo: {},
  currChildren: {},

  setSectionInfo: action((state, payload) => {
    state.x = payload(state.x);
  }),

  setSectionInfoAttr: action((state, payload) => {
    const { sectionId, sectionIds, attr, value } = payload;
    if (sectionIds) {
      sectionIds.forEach((id) => (state.x[id][attr] = value));
    } else {
      state.x[sectionId][attr] = value;
    }
  }),

  setSectionInfoAttrObjInput: action((state, payload) => {
    const { newValues } = payload;
    for (let sectionId of Object.keys(newValues)) {
      state.x[sectionId] = Object.assign(
        state.x[sectionId],
        newValues[sectionId]
      );
    }
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, childrenInfoId } = payload;
    state.idsOverview[sectionId] = childrenInfoId;
  }),

  setChildrenInfo: action((state, payload) => {
    const { childrenInfoId, newStateFn } = payload;
    const currState = setDefaultChildrenInfo(state, childrenInfoId);
    state.childrenInfo[childrenInfoId] = newStateFn(currState);
  }),

  setCurrChildren: action((state, payload) => {
    const { sectionId, currChildren } = payload;
    state.currChildren[sectionId] = currChildren;
  }),

  deleteSections: action((state, payload) => {
    const { sectionIds } = payload;
    for (let sid of sectionIds) {
      deleteSectionFn(state, sid);
    }
  }),

  idNames: computed([(state) => state.x], (x) => {
    return _.mapValues(x, (v) => v.name);
  }),

  topLevelSectionPositions: computed([(state) => state.x], (x) => {
    return _.map(
      _.filter(x, (v) => v.isTopLevel),
      (y) => ({ id: y.id, initialPosition: y.initialPosition })
    );
  }),

  setIdsOverviewThunk: thunk((actions, payload, helpers) => {
    const { sectionId, newStateFn } = payload;
    let childrenInfoId = helpers.getState().idsOverview[sectionId];
    if (!childrenInfoId) {
      childrenInfoId = createNewId();
      actions.setIdsOverview({ sectionId, childrenInfoId });
    }
    actions.setChildrenInfo({ childrenInfoId, newStateFn });
  }),

  moveChildThunk: thunk((actions, payload) => {
    const { oldParentId, newParentId, childId, newIndex } = payload;

    // Remove child from old parent's list
    if (oldParentId) {
      actions.setIdsOverviewThunk({
        sectionId: oldParentId,
        newStateFn: (x) => x.filter((y) => y !== childId),
      });
    } else {
      // This means it was a top level section
      actions.setSectionInfoAttr({
        sectionId: childId,
        attr: "isTopLevel",
        value: false,
      });
    }
    if (newParentId === PANEID) {
      // This means it's becoming a top level section
      actions.setSectionInfoAttr({
        sectionId: childId,
        attr: "isTopLevel",
        value: true,
      });
    } else {
      // Add child to new parent's list
      actions.setIdsOverviewThunk({
        sectionId: newParentId,
        newStateFn: (x) => [
          ...x.slice(0, newIndex),
          childId,
          ...x.slice(newIndex, x.length),
        ],
      });
    }

    // Set sectionInfo's parentId
    actions.setSectionInfoAttr({
      sectionId: childId,
      attr: "parentId",
      value: newParentId === PANEID ? undefined : newParentId,
    });
  }),

  export() {
    return {
      sectionInfos: exportState(this),
      idsOverview: this.idsOverview,
      childrenInfo: this.childrenInfo,
    };
  },
};

export default sectionInfos;

function deleteSectionFn(state, sectionId) {
  const childrenInfoId = state.idsOverview[sectionId];
  const childIds = state.childrenInfo[childrenInfoId];
  if (childIds) {
    for (let child of childIds) {
      deleteSectionFn(state, child);
    }
  }
  delete state.x[sectionId];
  delete state.idsOverview[sectionId];
  delete state.childrenInfo[childrenInfoId];
  delete state.currChildren[sectionId];
}
