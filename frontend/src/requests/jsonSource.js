import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import { post } from "./utils";

export async function dbLoadSectionJSONSource(sectionId) {
  return await post({
    body: {
      project: dataForRequest(),
      sectionId,
    },
    address: C.ROUTE_LOAD_SECTION_JSON_SOURCE,
  });
}

export async function dbSaveSectionJSONSource(sectionId) {
  return await post({
    body: {
      project: dataForRequest(),
      sectionId,
    },
    address: C.ROUTE_SAVE_SECTION_JSON_SOURCE,
  });
}

function dataForRequest() {
  const {
    x: sections,
    codeInfoCols,
    variants: sectionVariants,
  } = useSectionInfos.getState();
  const codeInfo = useSectionInfos.getState().codeInfo;
  return { sections, codeInfo, codeInfoCols, sectionVariants };
}
