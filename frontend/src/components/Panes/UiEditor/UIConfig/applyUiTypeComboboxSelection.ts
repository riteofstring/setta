import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { changeParamImpl, updateParamImplConfig } from "openapi/http";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  NotificationTypeEnum,
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
    const changeRes = (await callOpenAPI(
      changeParamImpl({
        body: {
          projectConfigId,
          sectionId,
          paramInfoId,
          selectedId: CodeObjTypeEnum.DateParam,
        },
      } as Parameters<typeof changeParamImpl>[0]),
    )) as ChangeParamImplRouteResponse;
    if (!res200(changeRes)) {
      addTemporaryNotification(
        getErrorDetail(changeRes.data) ?? "Failed to update parameter type.",
        NotificationTypeEnum.error,
      );
      return;
    }
    const configRes = (await callOpenAPI(
      updateParamImplConfig({
        body: {
          projectConfigId,
          sectionId,
          paramInfoId,
          newConfig: {
            dateControlMode: DateControlModeEnum.calendar,
            dateSelectionMode: DateSelectionModeEnum.multiple,
            dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
          },
        },
      } as Parameters<typeof updateParamImplConfig>[0]),
    )) as UpdateParamImplConfigRouteResponse;
    if (!res200(configRes)) {
      addTemporaryNotification(
        getErrorDetail(configRes.data) ??
          "Failed to apply calendar preset configuration.",
        NotificationTypeEnum.error,
      );
      return;
    }
    return;
  }
  const changeRes = (await callOpenAPI(
    changeParamImpl({
      body: {
        projectConfigId,
        sectionId,
        paramInfoId,
        selectedId,
      },
    } as Parameters<typeof changeParamImpl>[0]),
  )) as ChangeParamImplRouteResponse;
  if (!res200(changeRes)) {
    addTemporaryNotification(
      getErrorDetail(changeRes.data) ?? "Failed to update parameter type.",
      NotificationTypeEnum.error,
    );
  }
}
