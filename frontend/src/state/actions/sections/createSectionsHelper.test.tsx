import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  createProjectConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCreateSectionsList } from "./createSectionsHelper";

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
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("includes dedicated calendar and time display meta-control presets", () => {
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

    expect(calendar).toBeDefined();
    expect(timeDisplay).toBeDefined();
    expect(calendar?.controlCodeObjType).toBe(CodeObjTypeEnum.TextParam);
    expect(timeDisplay?.controlCodeObjType).toBe(CodeObjTypeEnum.TextParam);
    expect(calendar?.controlParamConfig).toEqual({
      uiType: TextParamInputUITypeEnum.date,
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    });
    expect(timeDisplay?.controlParamConfig).toEqual({
      uiType: TextParamInputUITypeEnum.time,
      timeControlMode: TimeControlModeEnum.display,
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
});
