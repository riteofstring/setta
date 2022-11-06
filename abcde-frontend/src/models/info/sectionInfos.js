import { action, computed, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";
import { getSectionType, getSectionTypeConfig } from "thunks/sections";
import { isListLike, isRoot, LIST, PANEID } from "utils/constants";

function setDefaultIdsOverview(state, sectionId) {
  if (!(sectionId in state.idsOverview)) {
    state.idsOverview[sectionId] = [];
  }
  return state.idsOverview[sectionId];
}

function getInitialState() {
  return { x: {}, idsOverview: {}, currChildren: {} };
}

const sectionInfos = {
  ...getInitialState(),

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

  setAllIdsOverview: action((state, payload) => {
    state.idsOverview = payload;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, newStateFn } = payload;
    const currState = setDefaultIdsOverview(state, sectionId);
    state.idsOverview[sectionId] = newStateFn(currState);
  }),

  setCurrChildren: action((state, payload) => {
    const { sectionId, currChildren } = payload;
    state.currChildren[sectionId] = currChildren;
  }),

  deleteSections: thunk((action, payload, helpers) => {
    const { sectionIds } = payload;
    for (let sid of sectionIds) {
      deleteSectionFn(helpers, sid);
    }
  }),

  idNames: computed([(state) => state.x], (x) => {
    return _.mapValues(x, (v) => v.name);
  }),

  moveSectionThunk: thunk((actions, payload, helpers) => {
    const { oldParentId, newParentId, sectionId, newIndex, position } = payload;

    // Remove child from old parent's list
    if (oldParentId) {
      actions.setIdsOverview({
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
      actions.setIdsOverview({
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

    maybeChangeSectionSubtype({
      newParentId,
      sectionId,
      state: helpers.getStoreState(),
      actions: helpers.getStoreActions(),
    });

    if (newParentId === PANEID && position) {
      actions.setSectionInfoAttr({
        sectionId,
        attr: "initialPosition",
        value: position,
      });
    }
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default sectionInfos;

function deleteSectionFn(helpers, sectionId) {
  const localState = helpers.getState();
  const childIds = localState.idsOverview[sectionId];
  if (childIds) {
    for (let child of childIds) {
      deleteSectionFn(helpers, child);
    }
  }
  if (helpers.getStoreState().activeSection.id === sectionId) {
    helpers.getStoreActions().activeSection.setId(null);
  }
  delete localState.x[sectionId];
  delete localState.idsOverview[sectionId];
  delete localState.currChildren[sectionId];
}

function maybeChangeSectionSubtype({ newParentId, sectionId, state, actions }) {
  const newParentUIType =
    newParentId === PANEID ? null : getSectionType(state, newParentId);
  const sectionUITypeConfig = getSectionTypeConfig(state, sectionId);
  const parentIsRoot = isRoot(newParentUIType?.type);
  const sectionIsListLike = isListLike(sectionUITypeConfig.subType);

  let configProps = {
    configName: "subType",
    newValueFn: (x) => x,
  };

  if (parentIsRoot && !sectionIsListLike) {
    configProps = { ...configProps, newValueFn: () => LIST };
  } else if (!parentIsRoot && sectionIsListLike) {
    configProps = { ...configProps, newValueFn: () => null };
  }

  actions.thunks.setSectionUITypeConfig({ sectionId, configProps });
}
