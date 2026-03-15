import { addTemporaryNotification } from "state/actions/notifications";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  route_change_param_impl,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { CALENDAR_PRESET_ID, CodeObjTypeFilterKey } from "./UITypeCombobox";

type ChangeParamImplRouteResponse = ResponseDataAndStatus<null>;
type UpdateParamImplConfigRouteResponse = ResponseDataAndStatus<null>;

export async function applyUiTypeComboboxSelection(args: {
  projectConfigId: string;
  sectionId: string;
  paramInfoId: string;
  selectedId: string;
  filterKey: CodeObjTypeFilterKey;
}) {
  const { projectConfigId, sectionId, paramInfoId, selectedId, filterKey } =
    args;
  if (selectedId === CALENDAR_PRESET_ID) {
    if (filterKey !== "control") {
      throw new Error(
        "Calendar preset selection is only valid for control params.",
      );
    }
    const changeRes: ChangeParamImplRouteResponse =
      await route_change_param_impl({
        projectConfigId,
        sectionId,
        paramInfoId,
        selectedId: CodeObjTypeEnum.DateParam,
      });
    if (!res200(changeRes)) {
      addTemporaryNotification(
        getErrorDetail(changeRes.data) ?? "Failed to update parameter type.",
        SettaNotificationTypeEnum.error,
      );
      return;
    }
    const configRes: UpdateParamImplConfigRouteResponse =
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
    if (!res200(configRes)) {
      addTemporaryNotification(
        getErrorDetail(configRes.data) ??
          "Failed to apply calendar preset configuration.",
        SettaNotificationTypeEnum.error,
      );
      return;
    }
    return;
  }
  const changeRes: ChangeParamImplRouteResponse =
    await route_change_param_impl({
      projectConfigId,
      sectionId,
      paramInfoId,
      selectedId,
    });
  if (!res200(changeRes)) {
    addTemporaryNotification(
      getErrorDetail(changeRes.data) ?? "Failed to update parameter type.",
      SettaNotificationTypeEnum.error,
    );
  }
}
