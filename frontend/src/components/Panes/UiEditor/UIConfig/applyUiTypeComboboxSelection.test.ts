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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_PRESET_ID } from "./UITypeCombobox";
import { applyUiTypeComboboxSelection } from "./applyUiTypeComboboxSelection";
import { addTemporaryNotification } from "state/actions/notifications";

vi.mock("utils/generatedEndpoints", () => ({
  route_change_param_impl: vi.fn(),
  route_update_param_impl_config: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
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
    vi.mocked(route_change_param_impl).mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    vi.mocked(route_update_param_impl_config).mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
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

  it("shows an error notification when calendar preset config update fails", async () => {
    vi.mocked(route_update_param_impl_config).mockResolvedValue({
      data: { detail: "preset failed" },
      status: 400,
      hasResponse: true,
    });

    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: CALENDAR_PRESET_ID,
    });

    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "preset failed",
      SettaNotificationTypeEnum.error,
    );
  });

  it("shows an error notification when changing a regular type fails", async () => {
    vi.mocked(route_change_param_impl).mockResolvedValue({
      data: { detail: "change failed" },
      status: 400,
      hasResponse: true,
    });

    await applyUiTypeComboboxSelection({
      ...baseArgs,
      selectedId: CodeObjTypeEnum.SliderParam,
    });

    expect(addTemporaryNotification).toHaveBeenCalledWith(
      "change failed",
      SettaNotificationTypeEnum.error,
    );
    expect(route_update_param_impl_config).not.toHaveBeenCalled();
  });

  it("throws when calendar preset is selected outside the control filter", async () => {
    await expect(
      applyUiTypeComboboxSelection({
        ...baseArgs,
        filterKey: "sectionParam",
        selectedId: CALENDAR_PRESET_ID,
      }),
    ).rejects.toThrow(
      "Calendar preset selection is only valid for control params.",
    );
    expect(route_change_param_impl).not.toHaveBeenCalled();
    expect(route_update_param_impl_config).not.toHaveBeenCalled();
  });
});
