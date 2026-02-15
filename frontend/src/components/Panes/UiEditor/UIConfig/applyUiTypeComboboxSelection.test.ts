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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_PRESET_ID } from "./UITypeCombobox";
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
    filterKey: "control" as const,
  };
  const endpointBaseArgs = {
    projectConfigId: "project-1",
    sectionId: "section-1",
    paramInfoId: "param-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches to DateParam calendar config for meta control calendar preset selection", async () => {
    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: CALENDAR_PRESET_ID,
    });

    expect(route_change_param_impl).toHaveBeenCalledWith({
      ...endpointBaseArgs,
      selectedId: CodeObjTypeEnum.DateParam,
    });
    expect(route_update_param_impl_config).toHaveBeenCalledWith({
      ...endpointBaseArgs,
      newConfig: {
        dateControlMode: DateControlModeEnum.calendar,
        dateSelectionMode: DateSelectionModeEnum.multiple,
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
      },
    });
  });

  it("passes through regular type/impl selection without config override", async () => {
    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: CodeObjTypeEnum.SliderParam,
    });

    expect(route_change_param_impl).toHaveBeenCalledWith({
      ...endpointBaseArgs,
      selectedId: CodeObjTypeEnum.SliderParam,
    });
    expect(route_update_param_impl_config).not.toHaveBeenCalled();
  });
});
