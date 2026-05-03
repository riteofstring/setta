/* @vitest-environment jsdom */

import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuDomIsland, GpuFlowScene } from "gpuFlow/scene";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdges";
import {
  createSharedChatEdgeFromConnection,
  isValidSharedChatEdgeConnection,
} from "state/actions/chatSharedEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import {
  createEdgeFromConnection,
  isValidDataEdgeConnection,
} from "state/actions/edges";
import {
  STATE_MACHINE_EDGE_HANDLE_IDS,
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
} from "state/actions/stateMachineEdges";
import {
  useMisc,
  useProjectSearch,
  useProjectState,
  useTypeErrors,
  type ZustandProjectState,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createNestedParamCodeObjImpl,
  createProjectConfig,
  createSingleConfig,
  createSwitchParamCodeObjImpl,
  createVariant,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";
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
    current: "button" as
      | "button"
      | "combobox-input"
      | "explicit-activation-target"
      | "mousedown-activation"
      | "pointer-activation",
  },
  paramInputProps: vi.fn(),
  paramNameInputProps: vi.fn(),
  requestAnimationFrameMock: vi.fn(),
  cancelAnimationFrameMock: vi.fn(),
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

vi.mock("components/Params/ParamItems/ParamInput", () => ({
  ParamInput: (props: {
    maybeErrorMessage?: string;
    paramInfoId: string;
    sectionId: string;
    tooltipParentDivId?: string | null;
  }) => {
    mocks.paramInputProps(props);
    if (mocks.paramInputRenderMode.current === "mousedown-activation") {
      return (
        <div
          data-gpu-flow-activation="mousedown"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onMouseDown={mocks.paramInputActivationMouseDown}
          tabIndex={0}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "pointer-activation") {
      return (
        <button
          type="button"
          data-gpu-flow-activation="pointer"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onPointerDown={mocks.paramInputActivationPointerDown}
          onPointerUp={mocks.paramInputActivationPointerUp}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "combobox-input") {
      return (
        <input
          type="text"
          role="combobox"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
          readOnly
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "explicit-activation-target") {
      return (
        <div data-gpu-flow-interactive="true" data-testid="param-input-wrapper">
          <button
            type="button"
            data-gpu-flow-activation-target="true"
            data-testid="param-input"
            onClick={mocks.paramInputActivationClick}
          />
        </div>
      );
    }
    return (
      <button
        type="button"
        data-gpu-flow-interactive="true"
        data-testid="param-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
        onClick={mocks.paramInputActivationClick}
      />
    );
  },
}));

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
        data-testid="param-name-input"
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
      />
    );
  },
}));

vi.mock("openapi/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openapi/http")>();
  return {
    ...actual,
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
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
} from "./projectGpuPortalAdapter";
import {
  getProjectRetainedContentConnectionOptions,
  getProjectRetainedContentInteractionOptions,
  getProjectScenePortConnectionOptions,
  getProjectScenePortConnectionPolicy,
  renderProjectGpuDomIsland,
} from "./projectGpuRetainedParamInteractionAdapter";

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

describe("project GPU retained param DOM islands", () => {
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
    mocks.callOpenAPIMock.mockClear();
    mocks.paramInputProps.mockClear();
    mocks.paramInputActivationClick.mockClear();
    mocks.paramInputActivationMouseDown.mockClear();
    mocks.paramInputActivationPointerDown.mockClear();
    mocks.paramInputActivationPointerUp.mockClear();
    mocks.paramInputRenderMode.current = "button";
    mocks.paramNameInputProps.mockClear();
    mocks.requestAnimationFrameMock.mockClear();
    mocks.cancelAnimationFrameMock.mockClear();
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

  it("mounts retained param inputs against the viewport CodeMirror tooltip portal", async () => {
    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          paramInfoId: "param-1",
          sectionId: "section-1",
          tooltipParentDivId: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
        }),
      );
      expect(
        rendered.host
          .querySelector('[data-testid="param-input"]')
          ?.getAttribute("data-tooltip-parent"),
      ).toBe(PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID);
      expect(mocks.subscribeToGpuViewportRepositionMock).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }

    expect(mocks.unsubscribeViewportRepositionMock).toHaveBeenCalledTimes(1);
  });

  it("passes retained param type-error messages into active controls", async () => {
    useTypeErrors.setState({
      errors: {
        "section-1": {
          callable: [],
          params: {
            "param-1": ["Expected int.", "Received text."],
          },
        },
      },
      userRequested: false,
    });

    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          maybeErrorMessage: "Expected int.\nReceived text.",
          paramInfoId: "param-1",
          sectionId: "section-1",
        }),
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }
  });

  it("replays the retained canvas activation click into mounted control islands without waiting for animation frame", async () => {
    const activationPoint = { x: 42, y: 64 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-testid="param-input"]'),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPointSpy,
    });
    const rendered = await renderIsland(
      retainedParamIsland({
        activation: {
          clientPoint: activationPoint,
          kind: "pointer",
        },
      }),
    );

    try {
      expect(elementFromPointSpy).toHaveBeenCalledWith(
        activationPoint.x,
        activationPoint.y,
      );
      expect(mocks.paramInputActivationClick).toHaveBeenCalledTimes(1);
      expect(mocks.requestAnimationFrameMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("replays retained canvas activation clicks into mounted combobox text inputs", async () => {
    mocks.paramInputRenderMode.current = "combobox-input";
    const activationPoint = { x: 44, y: 12 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-testid="param-input"]'),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPointSpy,
    });
    const rendered = await renderIsland(
      retainedParamIsland({
        activation: {
          clientPoint: activationPoint,
          kind: "pointer",
        },
      }),
    );

    try {
      expect(elementFromPointSpy).toHaveBeenCalledWith(
        activationPoint.x,
        activationPoint.y,
      );
      expect(mocks.paramInputActivationClick).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("prefers explicit retained DOM island activation targets inside interactive wrappers", async () => {
    mocks.paramInputRenderMode.current = "explicit-activation-target";
    const activationPoint = { x: 48, y: 16 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-testid="param-input-wrapper"]'),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPointSpy,
    });
    const rendered = await renderIsland(
      retainedParamIsland({
        activation: {
          clientPoint: activationPoint,
          kind: "pointer",
        },
      }),
    );

    try {
      expect(elementFromPointSpy).toHaveBeenCalledWith(
        activationPoint.x,
        activationPoint.y,
      );
      expect(mocks.paramInputActivationClick).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("replays retained canvas activation mousedown into mounted CodeMirror shells", async () => {
    mocks.paramInputRenderMode.current = "mousedown-activation";
    const activationPoint = { x: 54, y: 18 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-testid="param-input"]'),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPointSpy,
    });
    const rendered = await renderIsland(
      retainedParamIsland({
        activation: {
          clientPoint: activationPoint,
          kind: "pointer",
        },
      }),
    );

    try {
      expect(elementFromPointSpy).toHaveBeenCalledWith(
        activationPoint.x,
        activationPoint.y,
      );
      expect(mocks.paramInputActivationMouseDown).toHaveBeenCalledTimes(1);
      expect(mocks.paramInputActivationMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({
          clientX: activationPoint.x,
          clientY: activationPoint.y,
        }),
      );
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("replays retained canvas activation pointer sequences into mounted pointer controls", async () => {
    mocks.paramInputRenderMode.current = "pointer-activation";
    const activationPoint = { x: 58, y: 22 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-testid="param-input"]'),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPointSpy,
    });
    const rendered = await renderIsland(
      retainedParamIsland({
        activation: {
          clientPoint: activationPoint,
          kind: "pointer",
        },
      }),
    );

    try {
      expect(elementFromPointSpy).toHaveBeenCalledWith(
        activationPoint.x,
        activationPoint.y,
      );
      expect(mocks.paramInputActivationPointerDown).toHaveBeenCalledTimes(1);
      expect(mocks.paramInputActivationPointerDown).toHaveBeenCalledWith(
        expect.objectContaining({
          clientX: activationPoint.x,
          clientY: activationPoint.y,
          pointerId: 1,
        }),
      );
      expect(mocks.paramInputActivationPointerUp).toHaveBeenCalledTimes(1);
      expect(mocks.paramInputActivationPointerUp).toHaveBeenCalledWith(
        expect.objectContaining({
          clientX: activationPoint.x,
          clientY: activationPoint.y,
          pointerId: 1,
        }),
      );
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("records viewport client coordinates for retained DOM island activation", () => {
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          controlKind: "text-like",
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

    options.onHitClick({
      hit: controlHit,
      localPoint: { x: 120, y: 14 },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 120, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent);

    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activation: {
          clientPoint: { x: 220, y: 96 },
          kind: "pointer",
        },
      }),
    );
  });

  it("does not activate retained DOM islands for disabled control rows", () => {
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          controlKind: "text-like",
          depth: 0,
          id: "param-1",
          label: "Param 1",
          state: {
            disabled: true,
          },
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

    options.onHitClick({
      hit: controlHit,
      localPoint: { x: 120, y: 14 },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 120, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent);

    expect(onActiveParamDomIslandChange).not.toHaveBeenCalled();
  });

  it("does not activate retained DOM islands for display-only time controls", () => {
    seedTimeParamProjectState(TimeControlModeEnum.display);
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          controlKind: "date-time",
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
      localPoint: { x: 120, y: 14 },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 120, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    expect(options.shouldHandleHit?.(event)).toBe(false);
    options.onHitClick(event);

    expect(onActiveParamDomIslandChange).not.toHaveBeenCalled();
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

  it("does not activate retained param name islands when structure edits are disabled", () => {
    seedNestedParamNameProjectState();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          controlKind: "text-like",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 160, x: 0, y: 0 },
    });
    const labelHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "label",
    );
    if (!labelHit) {
      throw new Error("Expected retained label hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: false,
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
      hit: labelHit,
      localPoint: { x: 12, y: 14 },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 22,
        clientY: 16,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 12, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    expect(options.shouldHandleHit?.(event)).toBe(false);
    options.onHitClick(event);

    expect(onActiveParamDomIslandChange).not.toHaveBeenCalled();
  });

  it("mounts retained param name inputs against the viewport CodeMirror tooltip portal", async () => {
    const rendered = await renderIsland(retainedParamNameIsland());

    try {
      expect(mocks.paramNameInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          bg: "",
          border: "",
          hasChildren: false,
          paramInfoId: "param-1",
          sectionId: "section-1",
          tooltipParentDivId: PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
          validationBubbleContainerDivId:
            PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
          validationBubbleCoordinateSpace: "viewport",
        }),
      );
      expect(
        rendered.host
          .querySelector('[data-testid="param-name-input"]')
          ?.getAttribute("data-tooltip-parent"),
      ).toBe(PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID);
      expect(
        rendered.host.querySelector(
          '[data-gpu-project-param-name-dom-island="true"]',
        )?.id,
      ).toBe("param-label:section-1:param-1");
      expect(mocks.subscribeToGpuViewportRepositionMock).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }

    expect(mocks.unsubscribeViewportRepositionMock).toHaveBeenCalledTimes(1);
  });

  it("passes nested row presentation state into retained param name inputs", async () => {
    seedNestedParamNameProjectState();
    useTypeErrors.setState({
      errors: {
        "section-1": {
          callable: [],
          params: {
            "param-1": ["Expected int."],
          },
        },
      },
      userRequested: false,
    });
    useProjectSearch.setState({
      focused: {
        name: "Param",
        paramInfoId: "param-1",
        sectionId: "section-1",
      },
      lookup: new Set([createProjectSearchLookupKey("section-1", "param-1")]),
    });

    const rendered = await renderIsland(retainedParamNameIsland());

    try {
      expect(mocks.paramNameInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          bg: expect.stringContaining("!bg-blue-700"),
          border: "bg-red-200 dark:bg-red-800/30",
          hasChildren: true,
          paramInfoId: "param-1",
          sectionId: "section-1",
        }),
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }
  });
});

describe("project GPU retained param connection options", () => {
  afterEach(() => {
    useMisc.setState({ isSelectingParams: false });
  });

  it("provides Setta data-edge policy for scene-owned retained ports", () => {
    useMisc.setState({ isSelectingParams: false });
    const options = getProjectRetainedContentConnectionOptions({
      canEditStructure: true,
      zoomActivationKeyPressed: false,
    });
    const start = {
      handleId: "param-in",
      ownerSectionId: "section-1",
      surfaceId: "surface-1",
      type: "target" as const,
    };

    expect(options.onConnect).toBe(createEdgeFromConnection);
    expect(options.isValidConnection).toBe(isValidDataEdgeConnection);
    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: "other-output",
          sectionId: "section-2",
          type: "source",
        },
        start,
      ),
    ).toBe(true);
    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: "agentic-edge-source",
          sectionId: "section-2",
          type: "source",
        },
        start,
      ),
    ).toBe(false);
    expect(resolveDisabledOption(options.disabled)).toBe(false);

    useMisc.setState({ isSelectingParams: true });

    expect(resolveDisabledOption(options.disabled)).toBe(true);
  });
});

describe("project GPU scene port connection options", () => {
  afterEach(() => {
    useMisc.setState({ isSelectingParams: false });
  });

  it("routes section scene link starts through their project edge families", () => {
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: AGENTIC_EDGE_HANDLE_IDS.source,
      }),
    ).toEqual({
      isValidConnection: isValidAgenticEdgeConnection,
      onConnect: createAgenticEdgeFromConnection,
    });
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: SHARED_CHAT_EDGE_HANDLE_IDS.source,
      }),
    ).toEqual({
      isValidConnection: isValidSharedChatEdgeConnection,
      onConnect: createSharedChatEdgeFromConnection,
    });
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
      }),
    ).toEqual({
      isValidConnection: isValidStateMachineEdgeConnection,
      onConnect: createStateMachineEdgeFromConnection,
    });
    expect(
      getProjectScenePortConnectionPolicy({
        handleId: "param-output",
      }),
    ).toEqual({
      isValidConnection: isValidDataEdgeConnection,
      onConnect: createEdgeFromConnection,
    });
  });

  it("keeps scene-owned link starts on family-compatible targets only", () => {
    const options = getProjectScenePortConnectionOptions({
      canEditStructure: true,
      zoomActivationKeyPressed: false,
    });
    const start = {
      handleId: AGENTIC_EDGE_HANDLE_IDS.source,
      ownerSectionId: "section-1",
      type: "source" as const,
    };

    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: SHARED_CHAT_EDGE_HANDLE_IDS.target,
          sectionId: "section-2",
          type: "target",
        },
        start,
      ),
    ).toBe(true);
    expect(
      options.isConnectionCandidateAllowed?.(
        {
          handleId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          sectionId: "section-2",
          type: "target",
        },
        start,
      ),
    ).toBe(false);
    expect(resolveDisabledOption(options.disabled)).toBe(false);

    useMisc.setState({ isSelectingParams: true });

    expect(resolveDisabledOption(options.disabled)).toBe(true);
  });
});

const EMPTY_TEST_SCENE: GpuFlowScene = {
  contentSurfaces: [],
  domIslands: [],
  edges: [],
  revision: 0,
  sections: [],
};

function resolveDisabledOption(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function retainedParamIsland(
  overrides: Partial<GpuDomIsland> = {},
): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 160, x: 0, y: 0 },
    id: "param-control:section-1:param-1",
    kind: "retained-content-control",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 160, x: 10, y: 20 },
    source: {
      hitRecordId: "control:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
    ...overrides,
  };
}

function retainedParamNameIsland(): GpuDomIsland {
  return {
    clipOwnerId: "section-1:param-content:unpinned",
    contentRect: { height: 28, width: 120, x: 0, y: 0 },
    id: "param-label:section-1:param-1",
    kind: "retained-content-label",
    ownerSectionId: "section-1",
    rect: { height: 28, width: 120, x: 10, y: 20 },
    source: {
      hitRecordId: "label:param-1",
      kind: "retained-content",
      ownerRowId: "param-1",
      surfaceId: "section-1:param-content:unpinned",
    },
    zIndex: 3,
  };
}

function seedSwitchParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: createSwitchParamCodeObjImpl({
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          defaultVal: "false",
          description: "",
          id: paramImplId,
          isPreset: false,
          name: "param-1",
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.SwitchParam,
          typeAnnotation: "",
          value,
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

function seedTimeParamProjectState(
  timeControlMode: TimeParamCodeObjImpl["timeControlMode"],
) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: createTimeParamImpl({
          id: paramImplId,
          name: "param-1",
          timeControlMode,
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

function createTimeParamImpl({
  id,
  name,
  timeControlMode,
}: {
  readonly id: string;
  readonly name: string;
  readonly timeControlMode: TimeParamCodeObjImpl["timeControlMode"];
}): TimeParamCodeObjImpl {
  return {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "",
    description: "",
    id,
    isPreset: false,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    timeControlMode,
    timeDisplayFont: TimeDisplayFontEnum.monospace,
    timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
    timeDisplayScale: 1,
    timeDisplayTransparent: false,
    type: CodeObjTypeEnum.TimeParam,
    typeAnnotation: "",
    value: "12:30",
  };
}

function seedNestedParamNameProjectState() {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const childParamId = "param-child";
  const childVariantId = "param-child-variant";
  const childImplId = "param-child-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [childImplId]: createCodeParamCodeObjImpl({
          id: childImplId,
          name: childParamId,
        }),
        [paramImplId]: createNestedParamCodeObjImpl({
          children: [childParamId],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: paramImplId,
          isPreset: false,
          name: "param-1",
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [childVariantId]: createVariant({
          id: childVariantId,
          impl: childImplId,
          name: childVariantId,
          nonPresetImpls: [childImplId],
        }),
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        [childParamId]: createCore({
          defaultVariant: childVariantId,
          displayName: "",
          id: childParamId,
          name: childParamId,
          variants: [childVariantId],
        }),
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            [childParamId]: childVariantId,
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: ["param-1"],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}
