import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { findAll } from "z_utils/getDescendants";
import { getSectionTypeConfig } from "./sections/getters";

export async function copySections() {
  const activeSectionId = useActiveSection.getState().id;
  if (!activeSectionId) {
    return;
  }
  const sections = {
    [activeSectionId]: useSectionInfos.getState().x[activeSectionId],
  };
  const uiTypes = getUITypes(sections[activeSectionId]);
  const codeInfo = getCodeInfo(sections[activeSectionId]);
  const evCols = getEVCols(sections[activeSectionId]);
  const uiTypeCols = getUITypeCols(sections[activeSectionId]);
  await navigator.clipboard.writeText(
    JSON.stringify({ sections, uiTypes, codeInfo, evCols, uiTypeCols })
  );
  console.log("copied!")

}

function getUITypes(sectionInfo) {
  const uiTypeIds = [sectionInfo.uiTypeId, ...sectionInfo.nonPresetUITypeIds];
  return _.pick(useUITypes.getState().x, uiTypeIds);
}

function getCodeInfo(sectionInfo) {
  const codeInfoId = getSectionTypeConfig(sectionInfo.id).codeInfoId;
  return _.keyBy(findAll(useCodeInfo.getState().x, [codeInfoId]), (x) => x.id);
}

function getEVCols(sectionInfo) {
  const evColIds = [sectionInfo.evColId, ...sectionInfo.evColIds];
  return _.pick(useParamInfos.getState().x, evColIds);
}

function getUITypeCols(sectionInfo) {
  return useParamInfos.getState().y[sectionInfo.uiTypeColId];
}
