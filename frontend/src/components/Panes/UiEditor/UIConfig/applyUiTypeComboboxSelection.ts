import {
  route_change_param_impl,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
} from "utils/generatedTypes";
import { DATE_PICKER_PRESET_ID, TIME_INPUT_PRESET_ID } from "./UITypeCombobox";

export async function applyUiTypeComboboxSelection(args: {
  projectConfigId: string;
  sectionId: string;
  paramInfoId: string;
  selectedId: string;
}) {
  const { projectConfigId, sectionId, paramInfoId, selectedId } = args;
  if (selectedId === DATE_PICKER_PRESET_ID) {
    await route_change_param_impl({
      projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: CodeObjTypeEnum.TextParam,
    });
    await route_update_param_impl_config({
      projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: { uiType: TextParamInputUITypeEnum.date },
    });
    return;
  }
  if (selectedId === TIME_INPUT_PRESET_ID) {
    await route_change_param_impl({
      projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: CodeObjTypeEnum.TextParam,
    });
    await route_update_param_impl_config({
      projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        uiType: TextParamInputUITypeEnum.time,
        timeControlMode: TimeControlModeEnum.display,
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
