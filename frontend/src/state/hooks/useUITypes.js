import C from "constants/constants.json";
import { useUITypes } from "state/definitions";
import {
  DB_SOURCES_TAB,
  INFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import { useGetSectionInfo } from "./useGetSectionInfo";

export function useRequiredUIEditorTabs(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const uiTypeType = useUITypes((x) => x.x[uiTypeId].type);
  switch (uiTypeType) {
    case C.INFO:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB];
    case C.OUTPUT:
    case C.SOCIAL:
      return [SECTION_CONFIG_TAB];
    default:
      return [UI_CONFIG_TAB, SECTION_CONFIG_TAB, DB_SOURCES_TAB];
  }
}
