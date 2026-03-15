import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { CodeObjTypeEnum, createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateSectionsList } from "./createSectionCatalog";

function Probe({
  onResolve,
}: {
  onResolve: (items: ReturnType<typeof useCreateSectionsList>) => void;
}) {
  const items = useCreateSectionsList();
  onResolve(items);
  return null;
}

describe("createSectionCatalog", () => {
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

  it("exposes workflow control sections in a dedicated group", () => {
    let items: ReturnType<typeof useCreateSectionsList> = [];
    renderToStaticMarkup(
      <Probe
        onResolve={(resolvedItems) => {
          items = resolvedItems;
        }}
      />,
    );

    const workflowGroup = items.find((group) => group.group === "Workflow");

    expect(workflowGroup).toBeDefined();
    expect(workflowGroup?.items.map((item) => item.name)).toEqual([
      "State Machine Start",
      "State Machine Gate",
      "State Machine End",
    ]);
  });
});
