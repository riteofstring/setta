import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  createCore,
  createProjectConfig,
  createVariant,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  MetaControlSectionImplSchema,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopLevelSection } from "./createSections";
import {
  createTopLevelSectionFromImplSpecs,
  useCreateSectionsList,
} from "./createSectionsHelper";

vi.mock("utils/generatedEndpoints", () => ({
  route_update_param_impl_config: vi.fn(),
}));

vi.mock("./createSections", () => ({
  createTopLevelSection: vi.fn(),
}));

function Probe({
  onResolve,
}: {
  onResolve: (items: ReturnType<typeof useCreateSectionsList>) => void;
}) {
  const items = useCreateSectionsList();
  onResolve(items);
  return null;
}

describe("useCreateSectionsList", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("includes dedicated calendar meta-control preset and omits deprecated controls", () => {
    let items: ReturnType<typeof useCreateSectionsList> = [];
    renderToStaticMarkup(
      <Probe
        onResolve={(resolvedItems) => {
          items = resolvedItems;
        }}
      />,
    );

    const metaControlGroup = items.find(
      (group) => group.group === "MetaControls",
    );
    expect(metaControlGroup).toBeDefined();

    const calendar = metaControlGroup?.items.find(
      (item) => item.name === "Calendar",
    );
    const timeDisplay = metaControlGroup?.items.find(
      (item) => item.name === "Time Display",
    );
    const codeInput = metaControlGroup?.items.find(
      (item) => item.name === "Code Input",
    );

    expect(calendar).toBeDefined();
    expect(timeDisplay).toBeUndefined();
    expect(codeInput).toBeUndefined();
    expect(calendar?.controlCodeObjType).toBe(CodeObjTypeEnum.DateParam);
    expect(calendar?.controlParamConfig).toEqual({
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    });
  });

  it("places task board in the Other group instead of Section", () => {
    let items: ReturnType<typeof useCreateSectionsList> = [];
    renderToStaticMarkup(
      <Probe
        onResolve={(resolvedItems) => {
          items = resolvedItems;
        }}
      />,
    );

    const sectionGroup = items.find((group) => group.group === "Section");
    const otherGroup = items.find((group) => group.group === "Other");

    expect(sectionGroup).toBeDefined();
    expect(otherGroup).toBeDefined();
    expect(sectionGroup?.items.some((item) => item.name === "Task Board")).toBe(
      false,
    );
    expect(otherGroup?.items.some((item) => item.name === "Task Board")).toBe(
      true,
    );
  });

  it("applies preset config when meta control param id is provided via shared modifier", async () => {
    const sectionId = "section-1";
    const sectionVariantId = "section-variant-1";
    const sectionImplId = "section-impl-1";
    const controlParamId = "param-1";
    const controlConfig = {
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    };

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          [sectionId]: sectionVariantId,
        },
      });
      state.sections[sectionId] = createCore({
        id: sectionId,
        sharedModifier: {
          metaControlParamId: controlParamId,
        },
      });
      state.sectionImpls[sectionImplId] = MetaControlSectionImplSchema.parse({
        id: sectionImplId,
        codeObjVariantMap: {},
        metaControlParamId: null,
      });
      state.sectionVariants[sectionVariantId] = createVariant({
        id: sectionVariantId,
        impl: sectionImplId,
        nonPresetImpls: [sectionImplId],
      });
    });

    vi.mocked(createTopLevelSection).mockResolvedValue(sectionId);

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
});
