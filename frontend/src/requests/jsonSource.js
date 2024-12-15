import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import { post } from "./utils";

export async function dbLoadSectionJSONSource(sectionId, jsonSource) {
  return await post({
    body: {
      project: dataForRequest(),
      sectionId,
      jsonSource,
    },
    address: C.ROUTE_LOAD_SECTION_JSON_SOURCE,
  });
}

export async function dbSaveSectionJSONSource(sectionId, oldVariantName) {
  return await post({
    body: {
      project: dataForRequest(),
      sectionId,
      forking_from: oldVariantName,
    },
    address: C.ROUTE_SAVE_SECTION_JSON_SOURCE,
  });
}

function dataForRequest() {
  const {
    x: sections,
    codeInfoCols,
    variants: sectionVariants,
    codeInfo,
  } = useSectionInfos.getState();
  return { sections, codeInfo, codeInfoCols, sectionVariants };
}
