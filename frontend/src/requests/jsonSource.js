import C from "constants/constants.json";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { post } from "./utils";

export async function dbLoadSectionJSONSource(sectionId) {
  const sections = useSectionInfos.getState().x;
  const codeInfo = useCodeInfo.getState().x;
  const codeInfoCols = useSectionInfos.getState().codeInfoCols;
  const sectionVariants = useSectionInfos.getState().variants;
  return await post({
    body: {
      project: { sections, codeInfo, codeInfoCols, sectionVariants },
      sectionId,
    },
    address: C.ROUTE_LOAD_SECTION_JSON_SOURCE,
  });
}

export async function dbSaveSectionJSONSource(sectionId) {
  const sections = useSectionInfos.getState().x;
  const codeInfo = useCodeInfo.getState().x;
  const codeInfoCols = useSectionInfos.getState().codeInfoCols;
  const sectionVariants = useSectionInfos.getState().variants;

  return await post({
    body: {
      project: { sections, codeInfo, codeInfoCols, sectionVariants },
      sectionId,
    },
    address: C.ROUTE_SAVE_SECTION_JSON_SOURCE,
  });
}
