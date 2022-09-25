import { createAllInfo } from "classes/infoFactory";
import { SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
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
  }),

  loadSections: thunk((action, payload) => {
    const {
      codeInfo,
      globalDefaults,
      projectDefaults,
      sections,
      sectionChildren,
      ev,
      evCols,
      uiTypes,
      uiTypesCols,
    } = payload;

    action.loadObjInfoAndCollections(codeInfo);
    action.initUITypes(uiTypes);
    action.initParamDefaults({
      storeName: "globalParamDefaults",
      paramDefaults: globalDefaults.paramDefaults,
    });
    action.initParamDefaults({
      storeName: "projectParamDefaults",
      paramDefaults: projectDefaults.paramDefaults,
    });
    action.initEV(ev);
    action.initEVCols(evCols);
    action.initSections({ sections, sectionChildren });
  }),

  setActiveSection: action((state, payload) => {
    state.activeSection = payload;
  }),

  initParamDefaults: thunk((action, payload, helpers) => {
    const { storeName, paramDefaults } = payload;
    const setManyUITypeIds =
      helpers.getStoreActions()[storeName].setManyUITypeIds;
    setManyUITypeIds({ toUITypeId: paramDefaults });
  }),

  initUITypes: thunk((action, payload, helpers) => {
    const uiTypes = _.map(payload, (x) => new UIType(x));
    const setManyUITypes = helpers.getStoreActions().uiTypes.setManyUITypes;
    setManyUITypes({ uiTypes });
  }),

  initEV: thunk((action, payload, helpers) => {
    _.forEach(payload, (v, k) =>
      helpers
        .getStoreActions()
        .enteredValues.setEnteredValue({ enteredValueId: k, value: v })
    );
  }),

  initEVCols: thunk((action, payload, helpers) => {
    const pActions = helpers.getStoreActions().paramInfos;
    for (const colId of Object.keys(payload)) {
      for (const paramInfo of Object.values(payload[colId])) {
        const commonProps = {
          collectionId: colId,
          paramInfoId: paramInfo.id,
        };
        pActions.setEnteredValueId({
          ...commonProps,
          enteredValueId: paramInfo.enteredValueId,
        });
        if (paramInfo.childId) {
          pActions.setChildId({
            ...commonProps,
            childId: paramInfo.childId,
          });
        }
      }
    }
  }),

  initSections: thunk((action, payload, helpers) => {
    const { sections, sectionChildren } = payload;

    const projectSectionGroup =
      helpers.getStoreState().currProject.sectionGroup;
    const topLevelIds = sectionChildren[projectSectionGroup];

    let idx = 0;
    const sectionInfos = _.mapValues(sections, (x) => {
      const y = new SectionInfo({
        initialPosition: {
          x: 500 * (Math.floor(idx / 3) + 0.75),
          y: 300 * (idx % 3),
        },
        ...x,
        isTopLevel: topLevelIds.includes(x.id),
      });
      idx += 1;
      return y;
    });

    const setSectionInfo =
      helpers.getStoreActions().sectionInfos.setSectionInfo;
    const setIdsOverview =
      helpers.getStoreActions().sectionInfos.setIdsOverview;

    setSectionInfo((x) => ({ ...x, ...sectionInfos }));

    _.forEach(sectionChildren, (x, id) => {
      if (id !== projectSectionGroup) {
        setIdsOverview({ sectionId: id, newStateFn: () => x });
      }
    });
  }),

  exportSelected: thunk((action, payload, helpers) => {
    return exportSelected(helpers.getStoreState());
  }),
};

export default master;
