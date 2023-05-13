import { loadOneProject } from "abcde-test/src/loadTestData";
import { SECTION } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { newUIType } from "abcde-utils/src/objs/uiType";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { resetAllStores } from "models/utils";
import { ReactFlowProvider } from "react-flow-renderer";
import { loadProjectState } from "thunks/loadProjectState";
import { addSectionsToState } from "thunks/sections/createSectionInfo";
import { renderUseGetSectionType } from "./renderHooks";

export async function loadTestDataIntoState() {
  resetAllStores();
  const testData = await loadOneProject({});
  loadProjectState(testData);
}

export function getSectionByName(name) {
  return _.find(useSectionInfos.getState().x, (v) => v.name === name);
}

function getParamCollectionParamInfoByName(allCodeInfo, paramCollection, name) {
  const childrenInfo = paramCollection.children.map((x) => allCodeInfo[x]);
  return _.find(childrenInfo, (v) => v.name === name);
}

export function getParameterToTestOn(sectionName, paramName) {
  let result = null;

  // get section
  const sectionInfo = getSectionByName(sectionName);

  const { id: sectionId, configId } = sectionInfo;
  const { uiTypeId: sectionTypeId } = useSectionConfigs.getState().x[configId];
  // get sectionType
  ({ result } = renderUseGetSectionType(sectionId, "id"));
  expect(result.current).toEqual(sectionTypeId);
  ({ result } = renderUseGetSectionType(sectionId, "config"));
  const evColId = result.current.collections[0];

  // get the param collection that the section contains
  const allCodeInfo = useCodeInfo.getState().allCodeInfo;
  const variousParams = allCodeInfo[evColId];

  // get the parameter we are going to test on
  const paramInfo = getParamCollectionParamInfoByName(
    allCodeInfo,
    variousParams,
    paramName
  );
  return { sectionInfo, paramInfo };
}

export function addSectionInfo(inputUIType = null) {
  let uiType = inputUIType;
  if (!uiType) {
    uiType = addUIType({ type: SECTION });
  }
  const si = newSectionInfo({});
  const siConfig = newSectionConfig({ id: si.configId, uiTypeId: uiType.id });
  addSectionsToState({ [si.id]: si }, { [siConfig.id]: siConfig });
  return { section: si, sectionConfig: siConfig };
}

export function addUIType(props = {}) {
  const uiType = newUIType(props);
  useUITypes.getState().setUIType({ uiType });
  return uiType;
}

export function getReactFlowProvider() {
  return ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider>;
}

export function sectionIdFromName(name) {
  const sections = useSectionInfos.getState().x;
  return _.find(sections, (x) => x.name === name).id;
}
