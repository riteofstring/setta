import C from "constants/constants.json";
import {
  useCodeInfo,
  useCodeInfoCols,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
import { post } from "./utils";

export async function dbLoadSectionJSONSource(sectionId) {
  const sections = useSectionInfos.getState().x;
  const codeInfo = useCodeInfo.getState().x;
  const codeInfoCols = useCodeInfoCols.getState().x;
  const sectionVariants = useSectionVariants.getState().x;
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
  const codeInfoCols = useCodeInfoCols.getState().x;
  const sectionVariants = useSectionVariants.getState().x;

  return await post({
    body: {
      project: { sections, codeInfo, codeInfoCols, sectionVariants },
      sectionId,
    },
    address: C.ROUTE_SAVE_SECTION_JSON_SOURCE,
  });
}
