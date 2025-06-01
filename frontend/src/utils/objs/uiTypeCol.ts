import { BASE_UI_TYPE_IDS } from "utils/baseUITypes";
import { UITypeColEntry, UITypeName } from "utils/generatedTypes";

export function createUITypeColEntry(): UITypeColEntry {
  return {
    uiTypeId: BASE_UI_TYPE_IDS[UITypeName.TEXT],
    nonPresetUITypeIds: [],
  };
}
