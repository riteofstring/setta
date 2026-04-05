import { changeParamImpl, updateParamImplConfig } from "openapi/http";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  NotificationTypeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_PRESET_ID } from "./UITypeCombobox";
import { applyUiTypeComboboxSelection } from "./applyUiTypeComboboxSelection";
vi.mock("openapi/http", () => ({
  changeParamImpl: vi.fn(),
  updateParamImplConfig: vi.fn(),
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
    vi.mocked(changeParamImpl).mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    vi.mocked(updateParamImplConfig).mockResolvedValue({
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
    expect(changeParamImpl).toHaveBeenCalledWith({
      ...endpointBaseArgs,
      selectedId: CodeObjTypeEnum.DateParam,
    });
    expect(updateParamImplConfig).toHaveBeenCalledWith({
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
    expect(changeParamImpl).toHaveBeenCalledWith({
      ...endpointBaseArgs,
      selectedId: CodeObjTypeEnum.SliderParam,
    });
    expect(updateParamImplConfig).not.toHaveBeenCalled();
  });
  it("shows an error notification when calendar preset config update fails", async () => {
    vi.mocked(updateParamImplConfig).mockResolvedValue({
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
      NotificationTypeEnum.error,
    );
  });
  it("shows an error notification when changing a regular type fails", async () => {
    vi.mocked(changeParamImpl).mockResolvedValue({
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
      NotificationTypeEnum.error,
    );
    expect(updateParamImplConfig).not.toHaveBeenCalled();
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
    expect(changeParamImpl).not.toHaveBeenCalled();
    expect(updateParamImplConfig).not.toHaveBeenCalled();
  });
});
