import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  createProjectConfig,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  SectionTypeEnum,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopLevelSectionWithResult } from "./createSections";
import { createTopLevelSectionFromImplSpecs } from "./createSectionsHelper";

vi.mock("utils/generatedEndpoints", () => ({
  route_update_param_impl_config: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

vi.mock("./createSections", () => ({
  createTopLevelSectionWithResult: vi.fn(),
}));

describe("createTopLevelSectionFromImplSpecs", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    vi.mocked(route_update_param_impl_config).mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("applies preset config when create response includes a meta control param id", async () => {
    const sectionId = "section-1";
    const controlParamId = "param-1";
    const controlConfig = {
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    };

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
      });
    });

    vi.mocked(createTopLevelSectionWithResult).mockResolvedValue({
      sectionId,
      metaControlParamId: controlParamId,
    });

    createTopLevelSectionFromImplSpecs({
      name: "Calendar",
      implSpecs: { type: SectionTypeEnum.MetaControl },
      controlCodeObjType: CodeObjTypeEnum.DateParam,
      controlParamConfig: controlConfig,
    });

    await vi.waitFor(() => {
      expect(route_update_param_impl_config).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId,
        paramInfoId: controlParamId,
        newConfig: controlConfig,
      });
    });
  });

  it("shows a notification when post-create preset config update fails", async () => {
    const sectionId = "section-1";
    const controlParamId = "param-1";

    vi.mocked(route_update_param_impl_config).mockResolvedValue({
      data: { detail: "config failed" },
      status: 400,
      hasResponse: true,
    });
    vi.mocked(createTopLevelSectionWithResult).mockResolvedValue({
      sectionId,
      metaControlParamId: controlParamId,
    });

    createTopLevelSectionFromImplSpecs({
      name: "Calendar",
      implSpecs: { type: SectionTypeEnum.MetaControl },
      controlCodeObjType: CodeObjTypeEnum.DateParam,
      controlParamConfig: {
        dateControlMode: DateControlModeEnum.calendar,
        dateSelectionMode: DateSelectionModeEnum.multiple,
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
      },
    });

    await vi.waitFor(() => {
      expect(addTemporaryNotification).toHaveBeenCalledWith(
        "config failed",
        SettaNotificationTypeEnum.error,
      );
    });
  });
});
