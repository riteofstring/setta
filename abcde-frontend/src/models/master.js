import { SectionConfig, SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";
import { exportSelected } from "utils/exportSelected";

function getInitialState() {
  return { activeSection: null };
}

const master = {
  ...getInitialState(),

  clearSections: thunk((action, payload, helpers) => {
    resetProject(helpers.getStoreActions());
  }),

  loadSections: thunk((action, payload, helpers) => {
    const {
      project,
      codeInfo,
      globalDefaults,
      projectDefaults,
      sections,
      sectionConfigs,
      sectionConfigCol,
      sectionChildren,
      sectionChildrenIds,
      ev,
      evCols,
      uiTypes,
      uiTypesCols,
      kwargCols,
    } = payload;

    const a = helpers.getStoreActions();
    a.project.setAllProjectDetails(project);
    a.codeInfo.loadObjInfoAndCollections(codeInfo);
    action.initUITypes(uiTypes);
    a.paramInfos.setAllUITypeIds({ ...uiTypesCols });
    action.initParamDefaults({
      storeName: "globalParamDefaults",
      paramDefaults: globalDefaults.paramDefaults,
    });
    action.initParamDefaults({
      storeName: "projectParamDefaults",
      paramDefaults: projectDefaults.paramDefaults,
    });
    action.initEV(ev);
    a.paramInfos.setAllEnteredValueIds({ ...evCols });
    action.initKwargCols(kwargCols);
    action.initSections({
      sections,
      sectionConfigs,
      sectionConfigCol,
      sectionChildren,
      sectionChildrenIds,
    });
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
    const a = helpers.getStoreActions();
    _.forEach(payload, (v, k) => {
      a.enteredValues.setEnteredValue({ enteredValueId: k, value: v.value });
      a.enteredValues.setChildId({ enteredValueId: k, childId: v.childId });
    });
  }),

  initKwargCols: thunk((action, payload, helpers) => {
    const setKwargIds = helpers.getStoreActions().objInfos.setKwargIds;
    for (const colId of Object.keys(payload)) {
      for (const objInfoId of Object.keys(payload[colId])) {
        setKwargIds({
          collectionId: colId,
          objInfoId: objInfoId,
          newStateFn: () => payload[colId][objInfoId],
        });
      }
    }
  }),

  initSections: thunk((action, payload, helpers) => {
    let {
      sections,
      sectionConfigs,
      sectionConfigCol,
      sectionChildren,
      sectionChildrenIds,
    } = payload;
    let topLevelIds = null;
    ({ sections, sectionConfigs, sectionChildren, topLevelIds } =
      omitProjectSectionAndGetTopLevelIds(
        helpers.getStoreState(),
        sections,
        sectionConfigs,
        sectionChildren
      ));

    let idx = 0;
    const sectionInfos = _.mapValues(sections, (x) => {
      const initialPosition = {
        x: 500 * (Math.floor(idx / 3) + 0.75),
        y: 300 * (idx % 3),
      };
      const parentId = _.filter(sectionChildren, (v) => v.includes(x.id))[0];
      const y = new SectionInfo({
        initialPosition,
        ...x,
        parentId,
        configId: sectionConfigCol[x.id],
        sectionChildrenId: sectionChildrenIds[x.id],
        isTopLevel: topLevelIds.includes(x.id),
      });
      idx += 1;
      return y;
    });

    const sectionConfigInfos = _.mapValues(
      sectionConfigs,
      (x) => new SectionConfig(x)
    );

    const a = helpers.getStoreActions();

    a.sectionInfos.setSectionInfo((x) => ({ ...x, ...sectionInfos }));
    a.sectionConfigs.setSectionConfig((x) => ({ ...x, ...sectionConfigInfos }));
    a.sectionInfos.setAllIdsOverview({ ...sectionChildren });
  }),

  exportSelected: thunk((action, payload, helpers) => {
    return exportSelected(helpers.getStoreState());
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default master;

function omitProjectSectionAndGetTopLevelIds(
  state,
  sections,
  sectionConfigs,
  sectionChildren
) {
  const projectRootSection = state.project.rootSection;
  const topLevelIds = sectionChildren[projectRootSection];
  const projectSectionConfigId = sections[projectRootSection].configId;
  return {
    sections: _.omit(sections, projectRootSection),
    sectionConfigs: _.omit(sectionConfigs, projectSectionConfigId),
    sectionChildren: _.omit(sectionChildren, projectRootSection),
    topLevelIds,
  };
}

// reset states, except for state.project
// If you reset state.project, the id will be reset, causing another render in MainContainer
function resetProject(a) {
  a.globalParamDefaults.reset();
  a.projectParamDefaults.reset();
  a.codeInfo.reset();
  a.enteredValues.reset();
  a.objInfos.reset();
  a.paramInfos.reset();
  a.sectionConfigs.reset();
  a.sectionInfos.reset();
  a.uiTypes.reset();
  a.sectionPositions.reset();
  a.uiEditor.reset();
  a.master.reset();
}
