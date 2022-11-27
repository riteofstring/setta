import { SectionInfo } from "classes/mutableInfo";
import { action, computed, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";
import { getSectionType } from "thunks/sections";
import {
  isListRoot,
  isRoot,
  PANEID,
  rootTypeToChildSubType,
} from "utils/constants";
import { REF_ID } from "utils/uiTypeConstants";

function setDefaultAllChildren(state, sectionId) {
  if (!(sectionId in state.allChildren)) {
    state.allChildren[sectionId] = [];
  }
  return state.allChildren[sectionId];
}

function getInitialState() {
  return { x: {}, allChildren: {}, currChildren: {} };
}

const sectionInfos = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    const { sections, sectionConfigCol, sectionChildren, topLevelIds } =
      payload;
    const sectionInfos = _.mapValues(sections, (x) => {
      const parentId = _.filter(sectionChildren, (v) => v.includes(x.id))[0];
      const y = new SectionInfo({
        ...x,
        parentId,
        configId: sectionConfigCol[x.id],
        isTopLevel: topLevelIds.includes(x.id),
      });
      return y;
    });

    actions.reset();
    actions.setAll({ x: sectionInfos, allChildren: sectionChildren });
  }),

  setAll: action((state, payload) => {
    state.x = payload.x;
    state.allChildren = payload.allChildren;
  }),

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

  setAllChildren: action((state, payload) => {
    const { sectionId, newStateFn } = payload;
    const currState = setDefaultAllChildren(state, sectionId);
    state.allChildren[sectionId] = newStateFn(currState);
  }),

  setCurrChildrenNames: action((state, payload) => {
    const { currChildren, sectionType } = payload;

    if (isListRoot(sectionType.type)) {
      for (let idx = 0; idx < currChildren.length; idx++) {
        state.x[currChildren[idx]].name = `[${idx}]`;
      }
    }
  }),

  setCurrChildren: action((state, payload) => {
    const { sectionId, currChildren } = payload;
    state.currChildren[sectionId] = currChildren;
  }),

  removeSectionInfo: action((state, payload) => {
    delete state.x[payload];
    delete state.allChildren[payload];
    delete state.currChildren[payload];
  }),

  deleteSections: thunk((actions, payload, helpers) => {
    const { sectionIds } = payload;
    for (const sid of sectionIds) {
      deleteSectionFn(actions, helpers, sid);
    }
  }),

  idNames: computed([(state) => state.x], (x) => {
    return _.mapValues(x, (v) => v.name);
  }),

  moveSectionThunk: thunk((actions, payload, helpers) => {
    const { oldParentId, newParentId, sectionId, newIndex, position } = payload;
    const s = helpers.getStoreState();
    const a = helpers.getStoreActions();

    maybeChangeSectionSubtype({
      newParentId,
      sectionId,
      state: s,
      actions: a,
    });

    setSectionAttrBasedOnNewParent({
      oldParentId,
      newParentId,
      sectionId,
      newIndex,
      actions,
    });

    if (newParentId === PANEID && position) {
      actions.setSectionInfoAttr({
        sectionId,
        attr: "initialPosition",
        value: position,
      });
    }

    maybeChangeOldParamUIType({ oldParentId, sectionId, s, a });
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default sectionInfos;

function deleteSectionFn(actions, helpers, sectionId) {
  const childIds = helpers.getState().allChildren[sectionId];
  if (childIds) {
    for (const child of childIds) {
      deleteSectionFn(actions, helpers, child);
    }
  }
  if (helpers.getStoreState().activeSection.id === sectionId) {
    helpers.getStoreActions().activeSection.setId(null);
  }
  actions.removeSectionInfo(sectionId);
}

function setSectionAttrBasedOnNewParent({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
  actions,
}) {
  // Remove child from old parent's list
  if (oldParentId) {
    actions.setAllChildren({
      sectionId: oldParentId,
      newStateFn: (x) => x.filter((y) => y !== sectionId),
    });
  } else {
    // This means it was a top level section
    actions.setSectionInfoAttr({
      sectionId,
      attr: "isTopLevel",
      value: false,
    });
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    actions.setSectionInfoAttr({
      sectionId,
      attr: "isTopLevel",
      value: true,
    });
  } else {
    // Add child to new parent's list
    actions.setAllChildren({
      sectionId: newParentId,
      newStateFn: (x) => [
        ...x.slice(0, newIndex),
        sectionId,
        ...x.slice(newIndex, x.length),
      ],
    });
  }

  // Set sectionInfo's parentId
  actions.setSectionInfoAttr({
    sectionId,
    attr: "parentId",
    value: newParentId === PANEID ? undefined : newParentId,
  });
}

function maybeChangeSectionSubtype({ newParentId, sectionId, state, actions }) {
  const newParentUIType =
    newParentId === PANEID ? null : getSectionType(state, newParentId);
  const parentIsRoot = isRoot(newParentUIType?.type);

  let configProps = null;
  if (parentIsRoot) {
    configProps = {
      configName: "subType",
      newValueFn: () => rootTypeToChildSubType[newParentUIType.type],
    };
  } else {
    configProps = { configName: "subType", newValueFn: () => null };
  }

  actions.thunks.setSectionUITypeConfig({ sectionId, configProps });
}

function maybeChangeOldParamUIType({ oldParentId, sectionId, s, a }) {
  const { paramInfoId } = s.sectionInfos.x[sectionId];
  if (!paramInfoId) {
    return;
  }
  a.thunks.setParamChildId({
    sectionId: oldParentId,
    paramInfoId,
    childId: null,
  });

  a.thunks.setParamUITypeId({
    uiTypeId: REF_ID,
    sectionId: oldParentId,
    paramInfoId,
  });

  a.thunks.setParamEnteredValue({
    sectionId: oldParentId,
    paramInfoId,
    value: sectionId,
  });
}
