import { createAllInfo } from "classes/infoFactory";
import { SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { action, debug, thunk } from "easy-peasy";
import _ from "lodash";
import {
  DEFAULT_DEFAULT,
  GLOBAL_DEFAULT,
  PROJECT_DEFAULT,
} from "utils/constants";
import { exportSelected } from "utils/exportSelected";

const master = {
  allObjInfo: {},
  allCollections: {},
  activeSection: null,

  // actions
  // Load DATA
  loadObjInfoAndCollections: action((state, payload) => {
    ({ allObjInfo: state.allObjInfo, allCollections: state.allCollections } =
      createAllInfo(payload));

    console.log("master.allObjInfo", debug(state.allObjInfo))
  }),

  loadSections: thunk((action, payload) => {
    const {
      packages,
      defaultDefaults,
      globalDefaults,
      projectDefaults,
      uiData,
    } = payload;

    action.loadObjInfoAndCollections(packages);
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
    const uiTypes = _.map(payload, (x) => new UIType(x));
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
  const uiTypes = _.map(
    payload.uiTypes,
    (x) =>
      new UIType({
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
