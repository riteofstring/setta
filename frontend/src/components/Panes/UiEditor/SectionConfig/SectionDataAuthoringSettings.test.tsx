import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCalendarSectionImpl,
  createCallableSectionImpl,
  createClockSectionImpl,
  SectionTypeEnum,
  createCore,
  createListRootSectionImpl,
  ListRootViewModeEnum,
  createProjectConfig,
  createSpreadsheetSectionImpl,
  createTaskBoardSectionImpl,
  createTextBlockSectionImpl,
  createUserDefaultCalendarSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultClockSectionImpl,
  createUserDefaultListRootSectionImpl,
  createUserDefaultSpreadsheetSectionImpl,
  createUserDefaultTaskBoardSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
  TaskBoardViewModeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CalendarSectionSettings } from "./CalendarSectionSettings";
import { ChildDefaultsSettings } from "./ChildDefaultsSettings";
import { ClockSectionSettings } from "./ClockSectionSettings";
import { EdgePortsSettings } from "./EdgePortsSettings";
import { SpreadsheetSectionSettings } from "./SpreadsheetSectionSettings";
import { TaskBoardSettings } from "./TaskBoardSettings";
import { TextBlockSettings } from "./TextBlockSettings";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function seedSectionState({
  sectionId,
  sectionName,
  variantId,
  implId,
  impl,
}: {
  sectionId: string;
  sectionName: string;
  variantId: string;
  implId: string;
  impl: Record<string, unknown>;
}) {
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: sectionName,
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: impl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: [],
        unpinned: [],
      },
    };
  });
  syncStoreInitialState(useProjectState);
}

describe("Section data-authoring settings", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      sessionRunCount: 0,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders text block master font-size control", () => {
    const sectionId = "textblock-section";
    const implId = "textblock-impl";
    seedSectionState({
      sectionId,
      sectionName: "TextBlock",
      variantId: "textblock-variant",
      implId,
      impl: createTextBlockSectionImpl(createUserDefaultTextBlockSectionImpl(), {
        id: implId,
        masterFontSizePx: 19,
      }),
    });

    const markup = renderToStaticMarkup(<TextBlockSettings sectionId={sectionId} />);
    expect(markup).toContain("Master Font Size");
    expect(markup).toContain('type="range"');
    expect(markup).toContain("19px");
  });

  it("renders list root child defaults and view mode controls", () => {
    const sectionId = "listroot-section";
    const implId = "listroot-impl";
    seedSectionState({
      sectionId,
      sectionName: "ListRoot",
      variantId: "listroot-variant",
      implId,
      impl: createListRootSectionImpl(createUserDefaultListRootSectionImpl(), {
        id: implId,
        defaultChildSectionType: SectionTypeEnum.Dict,
        viewMode: ListRootViewModeEnum.task_list,
      }),
    });

    const markup = renderToStaticMarkup(
      <ChildDefaultsSettings sectionId={sectionId} />,
    );
    expect(markup).toContain("Default Child Section");
    expect(markup).toContain(
      "Incrementer-created children will use this section type by default.",
    );
    expect(markup).toContain('option value="Dict"');
    expect(markup).not.toContain('option value="GlobalVariables"');
    expect(markup).not.toContain('option value="GenPythonCode"');
    expect(markup).not.toContain('option value="GenPythonMetadata"');
    expect(markup).toContain("List Root View");
    expect(markup).toContain("option value=\"default\"");
    expect(markup).toContain("option value=\"task_list\" selected");
    expect(markup).toContain("option value=\"kanban\"");
  });

  it("renders callable string-args toggle in section config", () => {
    const sectionId = "callable-section";
    const implId = "callable-impl";
    seedSectionState({
      sectionId,
      sectionName: "Callable",
      variantId: "callable-variant",
      implId,
      impl: createCallableSectionImpl(createUserDefaultCallableSectionImpl(), {
        id: implId,
        allowUnquotedStringArgs: true,
      }),
    });

    const markup = renderToStaticMarkup(<EdgePortsSettings sectionId={sectionId} />);
    expect(markup).toContain("String Args");
    expect(markup).toContain(
      "When enabled, string-typed code params accept unquoted values.",
    );
  });

  it("renders clock section settings controls", () => {
    const sectionId = "clock-section";
    const implId = "clock-impl";
    seedSectionState({
      sectionId,
      sectionName: "Clock",
      variantId: "clock-variant",
      implId,
      impl: createClockSectionImpl(createUserDefaultClockSectionImpl(), {
        id: implId,
        timezone: "America/New_York",
      }),
    });

    const markup = renderToStaticMarkup(
      <ClockSectionSettings sectionId={sectionId} />,
    );
    expect(markup).toContain("Clock");
    expect(markup).toContain("Time format");
    expect(markup).toContain("Timezone");
    expect(markup).toContain("America/New_York");
  });

  it("renders calendar section settings controls", () => {
    const sectionId = "calendar-section";
    const implId = "calendar-impl";
    seedSectionState({
      sectionId,
      sectionName: "Calendar",
      variantId: "calendar-variant",
      implId,
      impl: createCalendarSectionImpl(createUserDefaultCalendarSectionImpl(), {
        id: implId,
        selectedDateIso: "2026-02-14",
      }),
    });

    const markup = renderToStaticMarkup(
      <CalendarSectionSettings sectionId={sectionId} />,
    );
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Selected date");
    expect(markup).toContain("option value=\"sunday\" selected");
  });

  it("renders task board section settings", () => {
    const sectionId = "task-board-section";
    const implId = "task-board-impl";
    seedSectionState({
      sectionId,
      sectionName: "TaskBoard",
      variantId: "task-board-variant",
      implId,
      impl: createTaskBoardSectionImpl(createUserDefaultTaskBoardSectionImpl(), {
        id: implId,
        viewMode: TaskBoardViewModeEnum.task_list,
      }),
    });

    const markup = renderToStaticMarkup(<TaskBoardSettings sectionId={sectionId} />);
    expect(markup).toContain("Task Board");
    expect(markup).toContain("View mode");
    expect(markup).toContain("option value=\"task_list\" selected");
  });

  it("renders spreadsheet section settings", () => {
    const sectionId = "spreadsheet-section";
    const implId = "spreadsheet-impl";
    seedSectionState({
      sectionId,
      sectionName: "Spreadsheet",
      variantId: "spreadsheet-variant",
      implId,
      impl: createSpreadsheetSectionImpl(
        createUserDefaultSpreadsheetSectionImpl(),
        {
          id: implId,
          readOnly: true,
        },
      ),
    });

    const markup = renderToStaticMarkup(
      <SpreadsheetSectionSettings sectionId={sectionId} />,
    );
    expect(markup).toContain("Spreadsheet");
    expect(markup).toContain("Grid density");
    expect(markup).toContain("Read-only grid");
    expect(markup).toContain("Show row numbers");
    expect(markup).toContain("Auto-reload when file changes");
  });
});
