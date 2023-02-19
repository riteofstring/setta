import { INFO, OUTPUT } from "abcde-utils/src/constants";
import { isUserPreset } from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import {
  INFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
} from "models/uiEditor";
import { useGetSectionConfig } from "./useSectionConfig";

export function useUserPresetUITypes() {
  return useUITypes(
    (x) => Object.values(x.x).filter((u) => isUserPreset(u)),
    _.isEqual
  );
}

export function useRequiredUIEditorTabs(sectionId) {
  const uiTypeId = useGetSectionConfig(sectionId, "uiTypeId");
  const uiTypeType = useUITypes((x) => x.x[uiTypeId].type);
  if ([OUTPUT, INFO].includes(uiTypeType)) {
    return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB];
  }
  return [SECTION_CONFIG_TAB, UI_CONFIG_TAB, INFO_CONFIG_TAB];
}
