/* @vitest-environment jsdom */

import type {
  GpuRetainedContentDragEvent,
  GpuRetainedContentInteractionEvent,
} from "gpuFlow/interactions/retainedContentInteraction";
import { getGpuRetainedContentRotaryKnobRect } from "gpuFlow/retainedContentControls";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuDomIsland } from "gpuFlow/scene";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useTypeErrors } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  getRetainedControlHit,
  retainedContentInteractionHit,
  retainedContentTestScene,
  seedButtonParamProjectState,
} from "testUtils/projectGpuRetainedParamInteractionFixtures";
import {
  EMPTY_TEST_SCENE,
  seedDropzoneParamProjectState,
  seedPasswordParamProjectState,
  seedRotaryParamProjectState,
  seedSliderParamProjectState,
  seedSwitchParamProjectState,
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

import {
  handleProjectGpuRetainedParamCanvasControlKeyDown,
  handleProjectGpuRetainedParamCanvasControlWheel,
} from "./projectGpuRetainedParamCanvasControlInput";
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

describe("project GPU retained param canvas controls", () => {
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

  it("toggles retained switch controls from canvas without mounting a DOM island", async () => {
    seedSwitchParamProjectState("false");
    vi.useFakeTimers();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 48,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            checked: false,
            defaultDisplayValue: "false",
            displayValue: "false",
            kind: "switch",
            rendererFamily: "switch",
            commitPolicy: "immediate",
          },
          controlKind: "switch",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 160, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: controlHit,
      localPoint: { x: 140, y: 14 },
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
      expect(options.shouldHandleHit?.(event)).toBe(true);
      options.onHitClick(event);

      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
        }),
      );
      expect(mocks.setActiveIdsMock).not.toHaveBeenCalled();

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
          value: "true",
        },
      });
      expect(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value,
      ).toBe("true");
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("triggers retained button controls from canvas without mounting a DOM island", () => {
    seedButtonParamProjectState();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 80,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "Run",
            displayValue: "Run",
            kind: "button",
            label: "Run",
            rendererFamily: "button",
            commitPolicy: "immediate",
          },
          controlKind: "button",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 160, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: controlHit,
      localPoint: { x: 140, y: 14 },
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

    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
    expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        paramInfoId: "param-1",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/run-button", {
      body: '{"ok":true}',
      headers: { "X-Test": "yes" },
      method: "POST",
    });
  });

  it("commits retained slider clicks from canvas without mounting a DOM island", async () => {
    seedSliderParamProjectState("0");
    vi.useFakeTimers();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "0",
            kind: "slider",
            rendererFamily: "slider",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 0,
          },
          controlKind: "slider",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: controlHit,
      localPoint: {
        x: controlHit.rect.x + controlHit.rect.width,
        y: controlHit.rect.y + controlHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 170, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    try {
      expect(options.shouldHandleHit?.(event)).toBe(true);
      options.onHitClick(event);

      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
        }),
      );

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
          value: "10",
        },
      });
      expect(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value,
      ).toBe("10");
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("previews retained slider drags without OpenAPI before committing on drag end", async () => {
    seedSliderParamProjectState("0");
    vi.useFakeTimers();
    const onActiveParamDomIslandChange = vi.fn();
    const onRetainedParamDragPreviewChange = vi.fn();
    const retainedParamDragSessionRef = { current: null };
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "0",
            kind: "slider",
            rendererFamily: "slider",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 0,
          },
          controlKind: "slider",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange,
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef,
      zoomActivationKeyPressed: false,
    });
    const activeHit = {
      hit: controlHit,
      localPoint: {
        x: controlHit.rect.x,
        y: controlHit.rect.y + controlHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerdown", {
        clientX: 120,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 80, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;
    const dragEndHit = {
      ...activeHit,
      localPoint: {
        x: controlHit.rect.x + controlHit.rect.width,
        y: controlHit.rect.y + controlHit.rect.height / 2,
      },
      screenPoint: { x: 170, y: 14 },
    } satisfies GpuRetainedContentInteractionEvent;
    const dragMoveEvent = {
      activeHit,
      flowPoint: dragEndHit.localPoint,
      hit: dragEndHit,
      nativeEvent: new MouseEvent("pointermove", {
        clientX: 210,
        clientY: 96,
      }) as PointerEvent,
      screenPoint: dragEndHit.screenPoint,
    } satisfies GpuRetainedContentDragEvent;
    const dragEndEvent = {
      ...dragMoveEvent,
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 210,
        clientY: 96,
      }) as PointerEvent,
    } satisfies GpuRetainedContentDragEvent;

    try {
      expect(options.shouldStartDrag?.(activeHit)).toBe(true);
      options.onHitDragStart(activeHit);

      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onRetainedParamDragPreviewChange).not.toHaveBeenCalled();
      expect(retainedParamDragSessionRef.current).toBe(null);

      options.onHitDragMove(dragMoveEvent);
      expect(mocks.setParamEnteredValueMock).not.toHaveBeenCalled();

      options.onHitDragEnd(dragEndEvent);
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
          value: "10",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("commits retained rotary clicks from canvas without mounting a DOM island", async () => {
    seedRotaryParamProjectState("0");
    vi.useFakeTimers();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "0",
            kind: "rotary",
            rendererFamily: "rotary",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 0,
          },
          controlKind: "rotary",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const knobRect = getGpuRetainedContentRotaryKnobRect(controlHit.rect);
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: controlHit,
      localPoint: {
        x: knobRect.x,
        y: knobRect.y + knobRect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 170, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    try {
      expect(options.shouldHandleHit?.(event)).toBe(true);
      options.onHitClick(event);

      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onActiveParamDomIslandChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
        }),
      );

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
          value: "10",
        },
      });
      expect(
        useProjectState.getState().codeObjImpls["param-1-impl"]?.value,
      ).toBe("10");
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("previews retained rotary drags without OpenAPI before committing on drag end", async () => {
    seedRotaryParamProjectState("0");
    vi.useFakeTimers();
    const onActiveParamDomIslandChange = vi.fn();
    const onRetainedParamDragPreviewChange = vi.fn();
    const retainedParamDragSessionRef = { current: null };
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "0",
            kind: "rotary",
            rendererFamily: "rotary",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 0,
          },
          controlKind: "rotary",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const knobRect = getGpuRetainedContentRotaryKnobRect(controlHit.rect);
    const knobCenter = {
      x: knobRect.x + knobRect.width / 2,
      y: knobRect.y + knobRect.height / 2,
    };
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange,
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef,
      zoomActivationKeyPressed: false,
    });
    const activeHit = {
      hit: controlHit,
      localPoint: {
        x: knobCenter.x,
        y: knobCenter.y,
      },
      nativeEvent: new MouseEvent("pointerdown", {
        clientX: 120,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 80, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;
    const dragEndHit = {
      ...activeHit,
      localPoint: {
        x: knobCenter.x,
        y: knobRect.y,
      },
      screenPoint: { x: 170, y: 14 },
    } satisfies GpuRetainedContentInteractionEvent;
    const dragMoveEvent = {
      activeHit,
      flowPoint: dragEndHit.localPoint,
      hit: dragEndHit,
      nativeEvent: new MouseEvent("pointermove", {
        clientX: 210,
        clientY: 96,
      }) as PointerEvent,
      screenPoint: dragEndHit.screenPoint,
    } satisfies GpuRetainedContentDragEvent;
    const dragEndEvent = {
      ...dragMoveEvent,
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 210,
        clientY: 96,
      }) as PointerEvent,
    } satisfies GpuRetainedContentDragEvent;

    try {
      expect(options.shouldStartDrag?.(activeHit)).toBe(true);
      options.onHitDragStart(activeHit);

      expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(null);
      expect(onRetainedParamDragPreviewChange).not.toHaveBeenCalled();
      expect(retainedParamDragSessionRef.current).toBe(null);

      options.onHitDragMove(dragMoveEvent);
      expect(mocks.setParamEnteredValueMock).not.toHaveBeenCalled();

      options.onHitDragEnd(dragEndEvent);
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
          value: "2",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("toggles retained switch controls from canvas keyboard without mounting a DOM island", async () => {
    seedSwitchParamProjectState("false");
    vi.useFakeTimers();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 48,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            checked: false,
            defaultDisplayValue: "false",
            displayValue: "false",
            kind: "switch",
            rendererFamily: "switch",
            commitPolicy: "immediate",
          },
          controlKind: "switch",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 160, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);

    try {
      expect(
        handleProjectGpuRetainedParamCanvasControlKeyDown({
          activeParamCanvasControl: {
            hitRecordId: controlHit.id,
            paramInfoId: "param-1",
            sectionId: "section-1",
            surfaceId: "section-1:param-content:unpinned",
          },
          event: { code: "Space", key: " " },
          scene: retainedContentTestScene(retainedScene),
        }),
      ).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.paramInputProps).not.toHaveBeenCalled();
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "true",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("triggers retained button controls from canvas keyboard without mounting a DOM island", () => {
    seedButtonParamProjectState();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 80,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "Run",
            displayValue: "Run",
            kind: "button",
            label: "Run",
            rendererFamily: "button",
            commitPolicy: "immediate",
          },
          controlKind: "button",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 160, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);

    expect(
      handleProjectGpuRetainedParamCanvasControlKeyDown({
        activeParamCanvasControl: {
          hitRecordId: controlHit.id,
          paramInfoId: "param-1",
          sectionId: "section-1",
          surfaceId: "section-1:param-content:unpinned",
        },
        event: { code: "Enter", key: "Enter" },
        scene: retainedContentTestScene(retainedScene),
      }),
    ).toBe(true);

    expect(mocks.paramInputProps).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/run-button", {
      body: '{"ok":true}',
      headers: { "X-Test": "yes" },
      method: "POST",
    });
  });

  it("reveals retained password values from canvas keyboard without mounting a DOM island", async () => {
    seedPasswordParamProjectState();
    mocks.callOpenAPIMock.mockImplementation(async (request: unknown) => {
      if (
        typeof request === "object" &&
        request !== null &&
        "route" in request &&
        request.route === "getPasswordParamValue"
      ) {
        return {
          data: { value: "revealed-secret" },
          hasResponse: true,
          status: 200,
        };
      }
      return {
        data: null,
        hasResponse: true,
        status: 200,
      };
    });
    const onPasswordRevealStateChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 180,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "",
            displayValue: "",
            hasSecret: true,
            kind: "password",
            placeholder: "Saved",
            rendererFamily: "password",
            revealAvailable: true,
            revealPending: false,
            revealedValue: null,
            commitPolicy: "native-island",
          },
          controlKind: "password",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 240, x: 0, y: 0 },
    });
    const revealHit = retainedScene.hitRecords.find(
      (candidate) =>
        candidate.kind === "control-subpart" &&
        candidate.subpartKind === "password-reveal",
    );
    if (!revealHit) {
      throw new Error("Expected retained password reveal hit.");
    }

    expect(
      handleProjectGpuRetainedParamCanvasControlKeyDown({
        activeParamCanvasControl: {
          hitRecordId: revealHit.id,
          paramInfoId: "param-1",
          sectionId: "section-1",
          surfaceId: "section-1:param-content:unpinned",
        },
        event: { code: "Enter", key: "Enter" },
        onPasswordRevealStateChange,
        passwordRevealStates: new Map(),
        scene: retainedContentTestScene(retainedScene),
      }),
    ).toBe(true);

    expect(mocks.paramInputProps).not.toHaveBeenCalled();
    expect(onPasswordRevealStateChange).toHaveBeenCalledWith({
      kind: "pending",
      paramInfoId: "param-1",
      sectionId: "section-1",
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getPasswordParamValueMock).toHaveBeenCalledWith({
      body: {
        paramInfoId: "param-1",
        projectConfigId: "project-1",
        sectionId: "section-1",
      },
    });
    expect(onPasswordRevealStateChange).toHaveBeenCalledWith({
      kind: "revealed",
      paramInfoId: "param-1",
      sectionId: "section-1",
      value: "revealed-secret",
    });
    expect(onPasswordRevealStateChange).toHaveBeenCalledWith({
      kind: "settle",
      paramInfoId: "param-1",
      sectionId: "section-1",
    });
  });

  it("deletes retained dropzone attachments from canvas keyboard without mounting a DOM island", async () => {
    const dropzoneValue = JSON.stringify({
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
    });
    seedDropzoneParamProjectState(dropzoneValue);
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
            displayValue: dropzoneValue,
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

    expect(
      handleProjectGpuRetainedParamCanvasControlKeyDown({
        activeParamCanvasControl: {
          hitRecordId: deleteHit.id,
          paramInfoId: "param-1",
          sectionId: "section-1",
          surfaceId: "section-1:param-content:unpinned",
        },
        event: { code: "Space", key: " " },
        scene: retainedContentTestScene(retainedScene),
      }),
    ).toBe(true);

    expect(mocks.paramInputProps).not.toHaveBeenCalled();

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
  });

  it("commits retained ranged control keyboard adjustments from canvas", async () => {
    seedSliderParamProjectState("4");
    vi.useFakeTimers();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "4",
            kind: "slider",
            rendererFamily: "slider",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 4,
          },
          controlKind: "slider",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);

    try {
      expect(
        handleProjectGpuRetainedParamCanvasControlKeyDown({
          activeParamCanvasControl: {
            hitRecordId: controlHit.id,
            paramInfoId: "param-1",
            sectionId: "section-1",
            surfaceId: "section-1:param-content:unpinned",
          },
          event: { code: "ArrowRight", key: "ArrowRight" },
          scene: retainedContentTestScene(retainedScene),
        }),
      ).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.paramInputProps).not.toHaveBeenCalled();
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "5",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("commits retained ranged control wheel adjustments from canvas", async () => {
    seedRotaryParamProjectState("5");
    vi.useFakeTimers();
    const onActiveParamCanvasControlChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "5",
            kind: "rotary",
            rendererFamily: "rotary",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 5,
          },
          controlKind: "rotary",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);

    try {
      expect(
        handleProjectGpuRetainedParamCanvasControlWheel({
          event: { deltaX: 0, deltaY: -40 },
          hit: retainedContentInteractionHit(retainedScene, controlHit),
          onActiveParamCanvasControlChange,
        }),
      ).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.paramInputProps).not.toHaveBeenCalled();
      expect(onActiveParamCanvasControlChange).toHaveBeenCalledWith({
        hitRecordId: controlHit.id,
        paramInfoId: "param-1",
        sectionId: "section-1",
        surfaceId: "section-1:param-content:unpinned",
      });
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "6",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
