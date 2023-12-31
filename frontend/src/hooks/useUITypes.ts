import { useUITypes } from "models/info/uiTypes";
import {
  INFO_CONFIG_TAB,
  RUNTIME_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
} from "models/uiEditor";
import { INFO, OUTPUT, SOCIAL } from "z_utils/constants";
import { useGetSectionInfo } from "./useSectionInfo";

export function useRequiredUIEditorTabs(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId, "uiTypeId");
  const uiTypeType = useUITypes((x) => x.x[uiTypeId].type);
  if ([OUTPUT, INFO, SOCIAL].includes(uiTypeType)) {
    return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB];
  }
  return [
    SECTION_CONFIG_TAB,
    UI_CONFIG_TAB,
    INFO_CONFIG_TAB,
    RUNTIME_CONFIG_TAB,
  ];
}
