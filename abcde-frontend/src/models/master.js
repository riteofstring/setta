import { createAllInfo } from "classes/infoFactory";
import { SectionInfo } from "classes/mutableInfo";
import { action, thunk, debug } from "easy-peasy";
import { getNewUIType } from "hooks/useUIType";
import _ from "lodash";
import {
  DEFAULT_DEFAULT,
  GLOBAL_DEFAULT,
  PROJECT_DEFAULT,
} from "utils/constants";
import { exportSelected } from "utils/exportSelected";

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
    const {
      packages,
      objCollections,
      paramCollections,
      defaultDefaults,
      globalDefaults,
      projectDefaults,
      uiData,
    } = payload;

    action._loadSections({
      packages,
      objCollections,
      paramCollections,
    });
    action.initDefaultDefaults(defaultDefaults);
    action.initGlobalDefaults(globalDefaults);
    action.initProjectDefaults(projectDefaults);
    action.initSectionUITypes(uiData.uiTypes);
    action.initSections(uiData.sections);
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
        initialPosition: {
          x: 500 * (Math.floor(idx / 3) + 0.75),
          y: 300 * (idx % 3),
        },
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

  exportSelected: thunk((action, payload, helpers) => {
    return exportSelected(helpers.getStoreState());
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
