import {
  route_change_param_impl,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
} from "utils/generatedTypes";
import { CALENDAR_PRESET_ID, CodeObjTypeFilterKey } from "./UITypeCombobox";

export async function applyUiTypeComboboxSelection(args: {
  projectConfigId: string;
  sectionId: string;
  paramInfoId: string;
  selectedId: string;
  filterKey: CodeObjTypeFilterKey;
}) {
  const { projectConfigId, sectionId, paramInfoId, selectedId } = args;
  if (selectedId === CALENDAR_PRESET_ID) {
    await route_change_param_impl({
      projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: CodeObjTypeEnum.DateParam,
    });
    await route_update_param_impl_config({
      projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: DateControlModeEnum.calendar,
        dateSelectionMode: DateSelectionModeEnum.multiple,
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
      },
    });
    return;
  }
  await route_change_param_impl({
    projectConfigId,
    sectionId,
    paramInfoId,
    selectedId,
  });
}
