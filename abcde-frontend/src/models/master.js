import { createAllInfo } from "classes/infoFactory";
import DefaultDefaults from "data/simpleTrainTestDefaultDefaults.json";
import GlobalDefaults from "data/simpleTrainTestGlobalDefaults.json";
import ObjCollectionsData from "data/simpleTrainTestObjCollections.json";
import PackagesData from "data/simpleTrainTestPackages.json";
import ParamCollectionsData from "data/simpleTrainTestParamCollections.json";
import ProjectDefaults from "data/simpleTrainTestProjectDefaults.json";
import UIData from "data/simpleTrainTestUI.json";
import { action, thunk, debug } from "easy-peasy";
import { createSectionInfoFn } from "hooks/useCreateInfo";
import { getNewUIType } from "hooks/useUIType";
import _ from "lodash";
import {
  DEFAULT_DEFAULT,
  GLOBAL_DEFAULT,
  PROJECT_DEFAULT,
} from "utils/constants";
import { createNewId } from "utils/sectionIds";

const master = {
  spaceBetweenPages: 100,
  available: {},
  uiSpecs: new Map(),
  allPackageInfo: null,
  allModuleInfo: null,
  allObjInfo: null,
  allObjCollections: null,
  allParamCollections: null,
  activeSection: null,
  groupIds: [],
  groupChildren: {},
  groupsHaveUpdated: false,

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    console.log("master payload", payload);
    state.uiSpecs = new Map(Object.entries(payload.ui));
    ({
      allPackageInfo: state.allPackageInfo,
      allModuleInfo: state.allModuleInfo,
      allObjInfo: state.allObjInfo,
      allObjCollections: state.allObjCollections,
      allParamCollections: state.allParamCollections,
    } = createAllInfo(payload));

    console.log("uiSpecs", debug(state.uiSpecs));
    console.log("allPackageInfo", debug(state.allPackageInfo));
    console.log("allObjCollections", debug(state.allObjCollections));
    console.log("allParamCollections", debug(state.allParamCollections));
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (true) {
      action._loadSections({
        ui: UIData,
        packages: PackagesData,
        objCollections: ObjCollectionsData,
        paramCollections: ParamCollectionsData,
      });
    } else {
      // action._loadSections(payload);
    }
    action.initDefaultDefaults(DefaultDefaults);
    action.initGlobalDefaults(GlobalDefaults);
    action.initProjectDefaults(ProjectDefaults);
    const newIds = action.initSections();
    action.initGroups(newIds);
  }),

  initSections: thunk((action, payload, helpers) => {
    const uiSpecs = helpers.getState().uiSpecs;
    const newIds = [];

    for (let idx = 0; idx < uiSpecs.size; idx++) {
      const newId = action.addSection({ uiSpecs, idx });
      newIds.push(newId[0]);
    }
    return newIds;
  }),

  initGroups: thunk((action, payload, helpers) => {
    const grouped = _.chunk(
      payload,
      helpers.getStoreState().userSettings.sectionsPerGroup
    );
    const groupIds = [];
    const groups = {};
    for (let g of grouped) {
      const groupId = createNewId();
      groupIds.push(groupId);
      groups[groupId] = g;
    }
    action.setGroupIds((x) => groupIds);
    action.setGroupChildren((x) => groups);
    action.setGroupsHaveUpdated(true);
  }),

  setActiveSection: action((state, payload) => {
    state.activeSection = payload;
  }),

  setGroupIds: action((state, payload) => {
    state.groupIds = payload(state.groupIds);
  }),

  setGroupChildren: action((state, payload) => {
    state.groupChildren = payload(state.groupChildren);
  }),

  setOneGroupChildren: action((state, payload) => {
    const { groupId, newStateFn } = payload;
    state.groupChildren[groupId] = newStateFn(state.groupChildren[groupId]);
  }),

  setGroupsHaveUpdated: action((state, payload) => {
    state.groupsHaveUpdated = payload;
  }),

  addSection: thunk((action, payload, helpers) => {
    const { uiSpecs, idx } = payload;
    const name = uiSpecs ? [...uiSpecs.keys()][idx] : "New Section";
    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
    const setSectionType =
      helpers.getStoreActions().sectionTypes.setSectionType;

    const sectionSpecs = uiSpecs?.get(name);

    return createSectionInfoFn({
      name,
      numChildren: 1,
      sectionSpecs,
      setSectionInfo,
      setSectionType,
    });
  }),

  initDefaultDefaults: thunk((action, payload, helpers) => {
    initDefaultHelper(
      payload,
      helpers.getStoreActions(),
      null,
      DEFAULT_DEFAULT
    );
  }),

  initGlobalDefaults: thunk((action, payload, helpers) => {
    initDefaultHelper(
      payload,
      helpers.getStoreActions(),
      "globalParamDefaults",
      GLOBAL_DEFAULT
    );
  }),

  initProjectDefaults: thunk((action, payload, helpers) => {
    initDefaultHelper(
      payload,
      helpers.getStoreActions(),
      "projectParamDefaults",
      PROJECT_DEFAULT
    );
  }),

  // exportSelected: thunk((action, payload, helpers) => {
  //   return createExportableObject(helpers.getState().sections);
  // }),

  // exportSaveableInfo: thunk((action, payload, helpers) => {
  //   const state = helpers.getState();
  //   const sections = state.sections;
  //   return sections.exportSaveableInfo();
  // }),

  // runSelected: thunk(async (action, payload, helpers) => {
  //   const { selected } = payload;
  //   generateAndRunCode({
  //     cliSocket: helpers.getStoreState().cliSocket.cliSocket,
  //     SELECTED: selected,
  //     FACTORIES: helpers.getStoreState().factoriesInfo.factories,
  //     FUNCS: helpers.getStoreState().funcsInfo.funcs,
  //   });
  // }),
};

export default master;

function initDefaultHelper(payload, storeActions, storeName, origin) {
  const setManyUITypes = storeActions.uiTypes.setManyUITypes;
  const setManyConfigs = storeActions.uiTypes.setManyConfigs;
  const uiTypes = _.map(payload.uiTypes, (x) =>
    getNewUIType({
      ...x,
      origin,
    })
  );
  const configs = _.map(payload.uiTypes, (x) => ({
    id: x.id,
    config: x.config,
  }));
  setManyUITypes({ uiTypes });
  setManyConfigs({ configs });

  if (storeName) {
    const setManyUITypeIds = storeActions[storeName].setManyUITypeIds;
    setManyUITypeIds({ toUITypeId: payload.paramDefaults });
  }
}
