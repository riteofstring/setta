import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  TimeControlModeEnum,
  TextParamInputUITypeEnum,
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

  it("includes dedicated date and time meta-control presets", () => {
    let items: ReturnType<typeof useCreateSectionsList> = [];
    renderToStaticMarkup(
      <Probe
        onResolve={(resolvedItems) => {
          items = resolvedItems;
        }}
      />,
    );

    const metaControlGroup = items.find((group) => group.group === "MetaControls");
    expect(metaControlGroup).toBeDefined();

    const datePicker = metaControlGroup?.items.find(
      (item) => item.name === "Date Picker",
    );
    const timeInput = metaControlGroup?.items.find(
      (item) => item.name === "Time Input",
    );

    expect(datePicker).toBeDefined();
    expect(timeInput).toBeDefined();
    expect(datePicker?.controlCodeObjType).toBe(CodeObjTypeEnum.TextParam);
    expect(timeInput?.controlCodeObjType).toBe(CodeObjTypeEnum.TextParam);
    expect(datePicker?.controlParamConfig).toEqual({
      uiType: TextParamInputUITypeEnum.date,
    });
    expect(timeInput?.controlParamConfig).toEqual({
      uiType: TextParamInputUITypeEnum.time,
      timeControlMode: TimeControlModeEnum.display,
    });
  });
});
