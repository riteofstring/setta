import { loadOneProject } from "abcde-test/src/loadTestData";
import { SECTION } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { newUIType } from "classes/uiType";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { loadSections } from "models/master";
import { resetAllSlices } from "models/utils";
import { ReactFlowProvider } from "react-flow-renderer";
import { renderUseGetSectionType } from "./renderHooks";

export async function loadTestDataIntoState() {
  resetAllSlices();
  const testData = await loadOneProject({});
  loadSections(testData);
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
  ({ result } = renderUseGetSectionType(sectionId, ["id", "config"]));
  expect(result.current[0]).toEqual(sectionTypeId);
  const evColId = result.current[1].collections[0];

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
  useSectionInfos.getState().setSectionInfo((x) => ({ ...x, [si.id]: si }));
  useSectionConfigs.getState().setSectionConfig((x) => ({
    ...x,
    [si.configId]: siConfig,
  }));
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
