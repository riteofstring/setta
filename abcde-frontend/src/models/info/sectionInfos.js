import { action, computed, thunk } from "easy-peasy";
import { getFnSetSectionConfigAttr } from "hooks/useSectionConfig";
import { getFnSetUIType } from "hooks/useUITypeCoreFunctions";
import _ from "lodash";
import { resetState } from "models/utils";
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

  topLevelSectionPositions: computed([(state) => state.x], (x) => {
    return _.map(
      _.filter(x, (v) => v.isTopLevel),
      (y) => ({ id: y.id, initialPosition: y.initialPosition })
    );
  }),

  moveChildThunk: thunk((actions, payload, helpers) => {
    const { oldParentId, newParentId, childId, newIndex } = payload;

    // Remove child from old parent's list
    if (oldParentId) {
      actions.setIdsOverview({
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
      actions.setIdsOverview({
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

    maybeChangeSectionSubtype({
      newParentId,
      childId,
      state: helpers.getStoreState(),
      actions: helpers.getStoreActions(),
    });
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default sectionInfos;

function deleteSectionFn(helpers, sectionId) {
  const childIds = helpers.getState().idsOverview[sectionId];
  if (childIds) {
    for (let child of childIds) {
      deleteSectionFn(helpers, child);
    }
  }
  if (helpers.getStoreState().master.activeSection === sectionId) {
    helpers.getStoreActions().master.setActiveSection(null);
  }
  delete helpers.getState().x[sectionId];
  delete helpers.getState().idsOverview[sectionId];
  delete helpers.getState().currChildren[sectionId];
}

function maybeChangeSectionSubtype({ newParentId, childId, state, actions }) {
  const newParentConfigId = state.sectionInfos.x[newParentId]?.configId;
  const newParentUITypeId = state.sectionConfigs.x[newParentConfigId]?.uiTypeId;
  const newParentUIType = state.uiTypes.x[newParentUITypeId];
  const {
    name: childSectionName,
    paramInfoId,
    configId: childConfigId,
  } = state.sectionInfos.x[childId];
  const childUITypeId = state.sectionConfigs.x[childConfigId].uiTypeId;
  const childUIType = state.uiTypes.x[childUITypeId];
  const setConfig = actions.uiTypes.setOneConfig;
  const setUIType = actions.uiTypes.setUIType;
  const setParamUITypeId = () => null; //TODO: determine best course of action here
  const setSectionUITypeId = getFnSetSectionConfigAttr(
    childConfigId,
    "uiTypeId",
    actions.sectionConfigs.setSectionConfigAttr
  );
  const possibleMatchWrapperFn = (fn) => fn(state.uiTypes.x);

  const configChangeFn = getFnSetUIType({
    paramInfoId,
    defaultName: childSectionName,
    childId,
    currUIType: childUIType,
    settingPreset: false,
    settingSectionConfig: true,
    sectionTypeConfig: newParentUIType?.config,
    setParamUITypeId,
    setSectionUITypeId,
    setConfig,
    setUIType,
    possibleMatchWrapperFn,
  })[1];

  const configProps = {
    configName: "subType",
  };

  const parentIsRoot = isRoot(newParentUIType?.type);
  const childIsListLike = isListLike(childUIType.config.subType);

  if (parentIsRoot && !childIsListLike) {
    configChangeFn({ ...configProps, newValueFn: () => LIST });
  } else if (!parentIsRoot && childIsListLike) {
    configChangeFn({ ...configProps, newValueFn: () => null });
  }
}
