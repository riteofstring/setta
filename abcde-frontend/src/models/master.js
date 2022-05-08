import { createAllInfo } from "classes/infoFactory";
import { SectionInfo } from "classes/mutableInfo";
import DefaultDefaults from "data/simpleTrainTestDefaultDefaults.json";
import GlobalDefaults from "data/simpleTrainTestGlobalDefaults.json";
import ObjCollectionsData from "data/simpleTrainTestObjCollections.json";
import PackagesData from "data/simpleTrainTestPackages.json";
import ParamCollectionsData from "data/simpleTrainTestParamCollections.json";
import ProjectDefaults from "data/simpleTrainTestProjectDefaults.json";
import UIData from "data/simpleTrainTestUI.json";
import { action, thunk, debug } from "easy-peasy";
import { getNewUIType } from "hooks/useUIType";
import _ from "lodash";
import {
  DEFAULT_DEFAULT,
  GLOBAL_DEFAULT,
  PROJECT_DEFAULT,
} from "utils/constants";

const master = {
  available: {},
  allPackageInfo: null,
  allModuleInfo: null,
  allObjInfo: null,
  allObjCollections: null,
  allParamCollections: null,
  activeSection: null,

  // actions
  // Load DATA
  _loadSections: action((state, payload) => {
    console.log("master payload", payload);
    ({
      allPackageInfo: state.allPackageInfo,
      allModuleInfo: state.allModuleInfo,
      allObjInfo: state.allObjInfo,
      allObjCollections: state.allObjCollections,
      allParamCollections: state.allParamCollections,
    } = createAllInfo(payload));

    console.log("allPackageInfo", debug(state.allPackageInfo));
    console.log("allObjCollections", debug(state.allObjCollections));
    console.log("allParamCollections", debug(state.allParamCollections));
  }),

  loadSections: thunk((action, payload, helpers) => {
    if (true) {
      action._loadSections({
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
    action.initSectionUITypes(UIData.uiTypes);
    action.initSections(UIData.sections);
  }),

  setActiveSection: action((state, payload) => {
    state.activeSection = payload;
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

  initSectionUITypes: thunk((action, payload, helpers) => {
    const uiTypes = _.map(payload, (x) => getNewUIType({ ...x }));
    const setManyUITypes = helpers.getStoreActions().uiTypes.setManyUITypes;
    setManyUITypes({ uiTypes });
  }),

  initSections: thunk((action, payload, helpers) => {
    let idx = 0;
    const sectionInfos = _.mapValues(payload, (x) => {
      const y = new SectionInfo({
        isTopLevel: true,
        initialPosition: { x: 250, y: 300 * idx },
        ...x,
      });
      idx += 1;
      return y;
    });
    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
    setSectionInfo((x) => ({ ...x, ...sectionInfos }));
    return _.keys(sectionInfos);
  }),
};

export default master;

function initDefaultHelper(payload, storeActions, storeName, origin) {
  const setManyUITypes = storeActions.uiTypes.setManyUITypes;
  const uiTypes = _.map(payload.uiTypes, (x) =>
    getNewUIType({
      ...x,
      origin,
    })
  );
  setManyUITypes({ uiTypes });

  if (storeName) {
    const setManyUITypeIds = storeActions[storeName].setManyUITypeIds;
    setManyUITypeIds({ toUITypeId: payload.paramDefaults });
  }
}
