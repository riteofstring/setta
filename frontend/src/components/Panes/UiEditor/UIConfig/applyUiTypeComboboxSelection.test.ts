import {
  route_change_param_impl,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_PRESET_ID, TIME_DISPLAY_PRESET_ID } from "./UITypeCombobox";
import { applyUiTypeComboboxSelection } from "./applyUiTypeComboboxSelection";

vi.mock("utils/generatedEndpoints", () => ({
  route_change_param_impl: vi.fn(),
  route_update_param_impl_config: vi.fn(),
}));

describe("applyUiTypeComboboxSelection", () => {
  const baseArgs = {
    projectConfigId: "project-1",
    sectionId: "section-1",
    paramInfoId: "param-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches to TextParam calendar config for calendar preset selection", async () => {
    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: CALENDAR_PRESET_ID,
    });

    expect(route_change_param_impl).toHaveBeenCalledWith({
      ...baseArgs,
      selectedId: CodeObjTypeEnum.TextParam,
    });
    expect(route_update_param_impl_config).toHaveBeenCalledWith({
      ...baseArgs,
      newConfig: {
        uiType: TextParamInputUITypeEnum.date,
        dateControlMode: DateControlModeEnum.calendar,
        dateSelectionMode: DateSelectionModeEnum.multiple,
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
      },
    });
  });

  it("switches to TextParam time display config for time preset selection", async () => {
    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: TIME_DISPLAY_PRESET_ID,
    });

    expect(route_change_param_impl).toHaveBeenCalledWith({
      ...baseArgs,
      selectedId: CodeObjTypeEnum.TextParam,
    });
    expect(route_update_param_impl_config).toHaveBeenCalledWith({
      ...baseArgs,
      newConfig: {
        uiType: TextParamInputUITypeEnum.time,
        timeControlMode: TimeControlModeEnum.display,
      },
    });
  });

  it("passes through regular type/impl selection without config override", async () => {
    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: CodeObjTypeEnum.SliderParam,
    });

    expect(route_change_param_impl).toHaveBeenCalledWith({
      ...baseArgs,
      selectedId: CodeObjTypeEnum.SliderParam,
    });
    expect(route_update_param_impl_config).not.toHaveBeenCalled();
  });
});
