/* @vitest-environment jsdom */

import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuDomIsland } from "gpuFlow/scene";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useTypeErrors } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  EMPTY_TEST_SCENE,
  calendarCells,
  seedColorPickerParamProjectState,
  seedDateParamProjectState,
  seedDropdownParamProjectState,
  seedDropzoneParamProjectState,
} from "testUtils/projectGpuRetainedParamInteractionParamFixtures.test.support";
import "testUtils/reactRefreshPreamble";
import { ArtifactTypeEnum, DropzoneModeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callOpenAPIMock: vi.fn(async () => ({
    data: null,
    hasResponse: true,
    status: 200,
  })),
  paramInputActivationClick: vi.fn(),
  paramInputActivationMouseDown: vi.fn(),
  paramInputActivationPointerDown: vi.fn(),
  paramInputActivationPointerUp: vi.fn(),
  paramInputRenderMode: {
    current: "native-color-input" as
      | "button-role-div"
      | "combobox-input"
      | "explicit-button-role-target"
      | "explicit-switch-role-target"
      | "explicit-activation-target"
      | "mousedown-activation"
      | "native-color-input"
      | "plain-button"
      | "pointer-activation"
      | "switch-role-button"
      | "textarea"
      | "text-input"
      | "time-input",
  },
  paramInputProps: vi.fn(),
  paramNameActivationMouseDown: vi.fn(),
  paramNameInputProps: vi.fn(),
  requestAnimationFrameMock: vi.fn(),
  cancelAnimationFrameMock: vi.fn(),
  deleteArtifactsMock: vi.fn((args: object) => ({
    args,
    route: "deleteArtifacts",
  })),
  getPasswordParamValueMock: vi.fn((args: object) => ({
    args,
    route: "getPasswordParamValue",
  })),
  setActiveIdsMock: vi.fn((args: object) => ({
    args,
    route: "setActiveIds",
  })),
  setParamEnteredValueMock: vi.fn((args: object) => ({
    args,
    route: "setParamEnteredValue",
  })),
  subscribeToGpuViewportRepositionMock: vi.fn(),
  unsubscribeViewportRepositionMock: vi.fn(),
}));

vi.mock("components/Params/ParamItems/ParamInput", async () => {
  const { createMockParamInput } = await import(
    "testUtils/projectGpuMockParamInput.test.support"
  );

  return { ParamInput: createMockParamInput(mocks) };
});

vi.mock("components/Params/ParamItems/ParamNameInput", () => ({
  ParamNameInput: (props: {
    bg: string;
    border: string;
    hasChildren: boolean;
    paramInfoId: string;
    sectionId: string;
    tooltipParentDivId?: string | null;
    validationBubbleContainerDivId?: string | null;
    validationBubbleCoordinateSpace?: string | null;
  }) => {
    mocks.paramNameInputProps(props);
    return (
      <div
        data-gpu-flow-activation="mousedown"
        data-gpu-flow-interactive="true"
        data-testid="param-name-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onMouseDown={mocks.paramNameActivationMouseDown}
        tabIndex={0}
      />
    );
  },
}));

vi.mock("openapi/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openapi/http")>();
  return {
    ...actual,
    deleteArtifacts: mocks.deleteArtifactsMock,
    getPasswordParamValue: mocks.getPasswordParamValueMock,
    setActiveIds: mocks.setActiveIdsMock,
    setParamEnteredValue: mocks.setParamEnteredValueMock,
  };
});

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: mocks.callOpenAPIMock,
  };
});

vi.mock("gpuFlow/viewportReposition", () => ({
  subscribeToGpuViewportReposition: () => {
    mocks.subscribeToGpuViewportRepositionMock();
    return mocks.unsubscribeViewportRepositionMock;
  },
}));

import { renderProjectGpuDomIsland } from "./projectGpuRetainedParamDomIslandRenderer";
import { getProjectRetainedContentInteractionOptions } from "./projectGpuRetainedParamInteractionAdapter";

type RenderedIsland = {
  host: HTMLDivElement;
  root: Root;
};

async function renderIsland(island: GpuDomIsland): Promise<RenderedIsland> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<>{renderProjectGpuDomIsland(island)}</>);
  });

  return { host, root };
}

async function cleanupRenderedIsland(rendered: RenderedIsland) {
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("project GPU retained param canvas popups", () => {
  beforeEach(() => {
    resetProjectStores();
    mocks.requestAnimationFrameMock.mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    );
    vi.stubGlobal("requestAnimationFrame", mocks.requestAnimationFrameMock);
    vi.stubGlobal("cancelAnimationFrame", mocks.cancelAnimationFrameMock);
    mocks.callOpenAPIMock.mockReset();
    mocks.callOpenAPIMock.mockImplementation(async () => ({
      data: null,
      hasResponse: true,
      status: 200,
    }));
    mocks.paramInputProps.mockClear();
    mocks.paramInputActivationClick.mockClear();
    mocks.paramInputActivationMouseDown.mockClear();
    mocks.paramInputActivationPointerDown.mockClear();
    mocks.paramInputActivationPointerUp.mockClear();
    mocks.paramInputRenderMode.current = "native-color-input";
    mocks.paramNameActivationMouseDown.mockClear();
    mocks.paramNameInputProps.mockClear();
    mocks.requestAnimationFrameMock.mockClear();
    mocks.cancelAnimationFrameMock.mockClear();
    mocks.deleteArtifactsMock.mockClear();
    mocks.getPasswordParamValueMock.mockClear();
    mocks.setActiveIdsMock.mockClear();
    mocks.setParamEnteredValueMock.mockClear();
    mocks.subscribeToGpuViewportRepositionMock.mockClear();
    mocks.unsubscribeViewportRepositionMock.mockClear();
    useTypeErrors.setState({ errors: {}, userRequested: false });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetProjectStores();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("commits configured color picker choices from canvas without mounting a DOM island", async () => {
    seedColorPickerParamProjectState("#ef4444");
    vi.useFakeTimers();
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const rows = [
      {
        control: {
          choices: [
            { color: "#ef4444", description: "Red" },
            { color: "#22c55e", description: "Green" },
          ],
          defaultDisplayValue: "#ef4444",
          displayValue: "#ef4444",
          kind: "color-picker" as const,
          rendererFamily: "color-picker",
          commitPolicy: "immediate" as const,
          selectedIndex: 0,
        },
        controlKind: "color-picker",
        depth: 0,
        id: "param-1",
        label: "Param 1",
      },
    ];
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 180, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        applyScrollOffsets: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const controlEvent = {
      hit: controlHit,
      localPoint: {
        x: controlHit.rect.x + controlHit.rect.width / 2,
        y: controlHit.rect.y + controlHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 140, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    try {
      expect(options.shouldHandleHit?.(controlEvent)).toBe(true);
      options.onHitClick(controlEvent);

      expect(onActiveParamCanvasPopupChange).toHaveBeenCalledWith({
        hitRecordId: "control:param-1",
        kind: "color-picker",
        paramInfoId: "param-1",
        sectionId: "section-1",
        surfaceId: "section-1:param-content:unpinned",
      });
      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
        }),
      );

      const popupScene = createGpuRetainedRowContentScene({
        activePopup: { kind: "color-picker", ownerRowId: "param-1" },
        controlWidth: 112,
        id: "section-1:param-content:unpinned",
        ownerSectionId: "section-1",
        rowHeight: 28,
        rows,
        scrollOffset: { x: 0, y: 0 },
        viewportRect: { height: 96, width: 180, x: 0, y: 0 },
      });
      const greenHit = popupScene.hitRecords.find(
        (candidate) =>
          candidate.kind === "popup-option" &&
          candidate.optionValue === "#22c55e",
      );
      if (!greenHit) {
        throw new Error("Expected retained color option hit.");
      }
      const optionEvent = {
        ...controlEvent,
        hit: greenHit,
        localPoint: {
          x: greenHit.rect.x + greenHit.rect.width / 2,
          y: greenHit.rect.y + greenHit.rect.height / 2,
        },
        retainedScene: popupScene,
      } satisfies GpuRetainedContentInteractionEvent;

      expect(options.shouldHandleHit?.(optionEvent)).toBe(true);
      options.onHitClick(optionEvent);

      expect(onActiveParamCanvasPopupChange).toHaveBeenLastCalledWith(null);
      expect(onActiveParamDomIslandChange).toHaveBeenLastCalledWith(null);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "#22c55e",
        },
      });
      expect(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value,
      ).toBe("#22c55e");
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("commits retained dropdown choices from canvas without mounting a DOM island", async () => {
    seedDropdownParamProjectState("small");
    vi.useFakeTimers();
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const rows = [
      {
        control: {
          choices: [
            { label: "Small", value: "small" },
            { label: "Large", value: "large" },
          ],
          defaultDisplayValue: "small",
          displayValue: "small",
          kind: "dropdown" as const,
          rendererFamily: "dropdown",
          commitPolicy: "immediate" as const,
          selectedIndex: 0,
        },
        controlKind: "dropdown",
        depth: 0,
        id: "param-1",
        label: "Param 1",
      },
    ];
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 180, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        applyScrollOffsets: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const controlEvent = {
      hit: controlHit,
      localPoint: {
        x: controlHit.rect.x + controlHit.rect.width / 2,
        y: controlHit.rect.y + controlHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 140, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    try {
      expect(options.shouldHandleHit?.(controlEvent)).toBe(true);
      options.onHitClick(controlEvent);

      expect(onActiveParamCanvasPopupChange).toHaveBeenCalledWith({
        hitRecordId: "control:param-1",
        kind: "dropdown",
        paramInfoId: "param-1",
        sectionId: "section-1",
        surfaceId: "section-1:param-content:unpinned",
      });
      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
        }),
      );

      const popupScene = createGpuRetainedRowContentScene({
        activePopup: { kind: "dropdown", ownerRowId: "param-1" },
        controlWidth: 112,
        id: "section-1:param-content:unpinned",
        ownerSectionId: "section-1",
        rowHeight: 28,
        rows,
        scrollOffset: { x: 0, y: 0 },
        viewportRect: { height: 96, width: 180, x: 0, y: 0 },
      });
      const largeHit = popupScene.hitRecords.find(
        (candidate) =>
          candidate.kind === "popup-option" &&
          candidate.optionValue === "large",
      );
      if (!largeHit) {
        throw new Error("Expected retained dropdown option hit.");
      }
      const optionEvent = {
        ...controlEvent,
        hit: largeHit,
        localPoint: {
          x: largeHit.rect.x + largeHit.rect.width / 2,
          y: largeHit.rect.y + largeHit.rect.height / 2,
        },
        retainedScene: popupScene,
      } satisfies GpuRetainedContentInteractionEvent;

      expect(options.shouldHandleHit?.(optionEvent)).toBe(true);
      options.onHitClick(optionEvent);

      expect(onActiveParamCanvasPopupChange).toHaveBeenLastCalledWith(null);
      expect(onActiveParamDomIslandChange).toHaveBeenLastCalledWith(null);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "large",
        },
      });
      expect(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value,
      ).toBe("large");
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("commits retained date calendar cells from canvas without mounting a DOM island", async () => {
    seedDateParamProjectState('["2026-05-04"]');
    vi.useFakeTimers();
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const rows = [
      {
        control: {
          calendar: {
            cells: calendarCells("2026-05-04"),
            includeTime: false,
            month: { monthIndex: 4, year: 2026 },
            monthTitle: "May 2026",
            selectedDates: ["2026-05-04"],
            selectedTimeValue: "00:00",
            selectionMode: "multiple" as const,
            summaryText: "1 selected",
            weekdayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          },
          defaultDisplayValue: "",
          displayValue: '["2026-05-04"]',
          kind: "date-time" as const,
          label: "Calendar",
          mode: "date-calendar" as const,
          rendererFamily: "date-time",
          summaryText: "1 selected",
          commitPolicy: "immediate" as const,
        },
        controlKind: "date-time",
        depth: 0,
        id: "param-1",
        label: "Param 1",
      },
    ];
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 260, width: 260, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        applyScrollOffsets: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const controlEvent = {
      hit: controlHit,
      localPoint: {
        x: controlHit.rect.x + controlHit.rect.width / 2,
        y: controlHit.rect.y + controlHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 140, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    try {
      expect(options.shouldHandleHit?.(controlEvent)).toBe(true);
      options.onHitClick(controlEvent);

      expect(onActiveParamCanvasPopupChange).toHaveBeenCalledWith({
        hitRecordId: "control:param-1",
        kind: "date-calendar",
        paramInfoId: "param-1",
        sectionId: "section-1",
        surfaceId: "section-1:param-content:unpinned",
        visibleMonth: { monthIndex: 4, year: 2026 },
      });
      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
        }),
      );

      const popupScene = createGpuRetainedRowContentScene({
        activePopup: { kind: "date-calendar", ownerRowId: "param-1" },
        controlWidth: 112,
        id: "section-1:param-content:unpinned",
        ownerSectionId: "section-1",
        rowHeight: 28,
        rows,
        scrollOffset: { x: 0, y: 0 },
        viewportRect: { height: 260, width: 260, x: 0, y: 0 },
      });
      const nextDateHit = popupScene.hitRecords.find(
        (candidate) =>
          candidate.kind === "popup-date-cell" &&
          candidate.cellIsoDate === "2026-05-05",
      );
      if (!nextDateHit) {
        throw new Error("Expected retained date cell hit.");
      }
      const cellEvent = {
        ...controlEvent,
        hit: nextDateHit,
        localPoint: {
          x: nextDateHit.rect.x + nextDateHit.rect.width / 2,
          y: nextDateHit.rect.y + nextDateHit.rect.height / 2,
        },
        retainedScene: popupScene,
      } satisfies GpuRetainedContentInteractionEvent;

      expect(options.shouldHandleHit?.(cellEvent)).toBe(true);
      options.onHitClick(cellEvent);

      expect(onActiveParamCanvasPopupChange).toHaveBeenLastCalledWith(null);
      expect(onActiveParamDomIslandChange).toHaveBeenLastCalledWith(null);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: '["2026-05-04","2026-05-05"]',
        },
      });
      expect(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value,
      ).toBe('["2026-05-04","2026-05-05"]');
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("navigates retained date calendar months from canvas without mounting a DOM island", () => {
    seedDateParamProjectState('["2026-05-04"]');
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const rows = [
      {
        control: {
          calendar: {
            cells: calendarCells("2026-05-04"),
            includeTime: false,
            month: { monthIndex: 4, year: 2026 },
            monthTitle: "May 2026",
            selectedDates: ["2026-05-04"],
            selectedTimeValue: "00:00",
            selectionMode: "multiple" as const,
            summaryText: "1 selected",
            weekdayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          },
          defaultDisplayValue: "",
          displayValue: '["2026-05-04"]',
          kind: "date-time" as const,
          label: "Calendar",
          mode: "date-calendar" as const,
          rendererFamily: "date-time",
          summaryText: "1 selected",
          commitPolicy: "immediate" as const,
        },
        controlKind: "date-time",
        depth: 0,
        id: "param-1",
        label: "Param 1",
      },
    ];
    const popupScene = createGpuRetainedRowContentScene({
      activePopup: { kind: "date-calendar", ownerRowId: "param-1" },
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 260, width: 260, x: 0, y: 0 },
    });
    const nextMonthHit = popupScene.hitRecords.find(
      (candidate) =>
        candidate.kind === "popup-date-navigation" &&
        candidate.navigationDirection === 1,
    );
    if (!nextMonthHit) {
      throw new Error("Expected retained date calendar navigation hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        applyScrollOffsets: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: nextMonthHit,
      localPoint: {
        x: nextMonthHit.rect.x + nextMonthHit.rect.width / 2,
        y: nextMonthHit.rect.y + nextMonthHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 244,
        clientY: 58,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene: popupScene,
      screenPoint: { x: 244, y: 58 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    expect(options.shouldHandleHit?.(event)).toBe(true);
    options.onHitClick(event);

    expect(onActiveParamCanvasPopupChange).toHaveBeenCalledWith({
      hitRecordId: "popup-date-navigation:param-1:1",
      kind: "date-calendar",
      paramInfoId: "param-1",
      sectionId: "section-1",
      surfaceId: "section-1:param-content:unpinned",
      visibleMonth: { monthIndex: 5, year: 2026 },
    });
    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
    expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        paramInfoId: "param-1",
      }),
    );
    expect(mocks.setParamEnteredValueMock).not.toHaveBeenCalled();
  });

  it("dismisses retained canvas popups on pointer miss without mounting a DOM island", () => {
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const rows = [
      {
        control: {
          choices: [
            { label: "Small", value: "small" },
            { label: "Large", value: "large" },
          ],
          defaultDisplayValue: "small",
          displayValue: "small",
          kind: "dropdown" as const,
          rendererFamily: "dropdown",
          commitPolicy: "immediate" as const,
          selectedIndex: 0,
        },
        controlKind: "dropdown",
        depth: 0,
        id: "param-1",
        label: "Param 1",
      },
    ];
    const popupScene = createGpuRetainedRowContentScene({
      activePopup: { kind: "dropdown", ownerRowId: "param-1" },
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 180, x: 0, y: 0 },
    });
    const backgroundHit = popupScene.hitRecords.find(
      (candidate) => candidate.kind === "popup-background",
    );
    if (!backgroundHit) {
      throw new Error("Expected retained popup background hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        applyScrollOffsets: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const backgroundEvent = {
      hit: backgroundHit,
      localPoint: {
        x: backgroundHit.rect.x + backgroundHit.rect.width / 2,
        y: backgroundHit.rect.y + backgroundHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene: popupScene,
      screenPoint: { x: 140, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    expect(options.shouldHandleHit?.(backgroundEvent)).toBe(true);
    options.onHitClick(backgroundEvent);

    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
    expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        paramInfoId: "param-1",
      }),
    );
    expect(onActiveParamCanvasPopupChange).not.toHaveBeenCalledWith(null);

    options.onPointerDownMiss?.({
      nativeEvent: new MouseEvent("pointerdown", {
        clientX: 12,
        clientY: 12,
      }) as PointerEvent,
      screenPoint: { x: 12, y: 12 },
    });

    expect(onActiveParamCanvasPopupChange).toHaveBeenCalledWith(null);
  });

  it("deletes retained dropzone attachments from canvas without mounting a DOM island", async () => {
    seedDropzoneParamProjectState(
      JSON.stringify({
        attachments: [
          {
            kind: "file",
            id: "artifact-a",
            name: "input.csv",
            size: 2048,
          },
          {
            kind: "file",
            id: "artifact-b",
            name: "output.csv",
            size: 4096,
          },
        ],
      }),
    );
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamCanvasControlChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 220,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            attachments: [
              {
                id: "artifact-a",
                kind: "file",
                name: "input.csv",
                sizeLabel: "2 KB",
              },
              {
                id: "artifact-b",
                kind: "file",
                name: "output.csv",
                sizeLabel: "4 KB",
              },
            ],
            canAttachMore: false,
            defaultDisplayValue: "",
            displayValue: JSON.stringify({
              attachments: [
                {
                  kind: "file",
                  id: "artifact-a",
                  name: "input.csv",
                  size: 2048,
                },
                {
                  kind: "file",
                  id: "artifact-b",
                  name: "output.csv",
                  size: 4096,
                },
              ],
            }),
            kind: "dropzone",
            label: "2 attachments",
            maxAttachments: 2,
            mode: DropzoneModeEnum.STATEFUL,
            placeholder: "Drop a file here",
            remainingSlots: 0,
            rendererFamily: "dropzone",
            commitPolicy: "native-island",
          },
          controlKind: "dropzone",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 280, x: 0, y: 0 },
    });
    const deleteHit = retainedScene.hitRecords.find(
      (candidate) =>
        candidate.kind === "control-subpart" &&
        candidate.subpartKind === "dropzone-attachment-delete" &&
        candidate.attachmentId === "artifact-b",
    );
    if (!deleteHit) {
      throw new Error("Expected retained dropzone delete hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasControlChange,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        applyScrollOffsets: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: deleteHit,
      localPoint: {
        x: deleteHit.rect.x + deleteHit.rect.width / 2,
        y: deleteHit.rect.y + deleteHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 140, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    expect(options.shouldHandleHit?.(event)).toBe(true);
    options.onHitClick(event);

    expect(onActiveParamCanvasPopupChange).toHaveBeenCalledWith(null);
    expect(onActiveParamCanvasControlChange).toHaveBeenCalledWith({
      hitRecordId: deleteHit.id,
      paramInfoId: "param-1",
      sectionId: "section-1",
      surfaceId: "section-1:param-content:unpinned",
    });
    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
    expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        paramInfoId: "param-1",
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
      body: {
        frontendOpId: expect.any(String),
        paramInfoId: "param-1",
        projectConfigId: "project-1",
        sectionId: "section-1",
        sectionVariantId: "section-1-variant",
        value: expect.any(String),
      },
    });
    const setValue = (
      mocks.setParamEnteredValueMock.mock.calls[0]?.[0] as {
        body: { value: string };
      }
    ).body.value;
    expect(JSON.parse(setValue)).toEqual({
      attachments: [
        {
          kind: "file",
          id: "artifact-a",
          name: "input.csv",
          size: 2048,
        },
      ],
    });
    expect(mocks.deleteArtifactsMock).toHaveBeenCalledWith({
      body: {
        artifacts: [
          {
            id: "artifact-b",
            type: ArtifactTypeEnum.File,
          },
        ],
      },
    });
    expect(
      JSON.parse(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value ?? "",
      ),
    ).toEqual({
      attachments: [
        {
          kind: "file",
          id: "artifact-a",
          name: "input.csv",
          size: 2048,
        },
      ],
    });
  });
});
