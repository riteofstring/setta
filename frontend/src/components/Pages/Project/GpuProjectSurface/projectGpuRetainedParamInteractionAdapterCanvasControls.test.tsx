/* @vitest-environment jsdom */

import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuDomIsland } from "gpuFlow/scene";
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
import { useMisc, useProjectSearch, useTypeErrors } from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import { resetProjectStores } from "state/utils";
import {
  resolveDisabledOption,
  retainedParamNameIsland,
  textLikeControlDescriptor,
} from "testUtils/projectGpuRetainedParamInteractionFixtures";
import {
  EMPTY_TEST_SCENE,
  seedNestedParamNameProjectState,
  seedPasswordParamProjectState,
} from "testUtils/projectGpuRetainedParamInteractionParamFixtures.test.support";
import "testUtils/reactRefreshPreamble";
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

vi.mock("components/Params/ParamItems/ParamInput", () => ({
  ParamInput: (props: {
    focusActiveSectionOnTextInput?: boolean;
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
    if (mocks.paramInputRenderMode.current === "native-color-input") {
      return (
        <input
          type="color"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "time-input") {
      return (
        <input
          type="time"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "text-input") {
      return (
        <input
          type="text"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "textarea") {
      return (
        <textarea
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "button-role-div") {
      return (
        <div
          role="button"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
          tabIndex={0}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "switch-role-button") {
      return (
        <button
          type="button"
          role="switch"
          data-gpu-flow-interactive="true"
          data-testid="param-input"
          data-tooltip-parent={props.tooltipParentDivId ?? ""}
          onClick={mocks.paramInputActivationClick}
        />
      );
    }
    if (mocks.paramInputRenderMode.current === "explicit-activation-target") {
      return (
        <>
          <span data-testid="param-input-pointer-miss" />
          <div
            data-gpu-flow-interactive="true"
            data-testid="param-input-wrapper"
          >
            <button
              type="button"
              data-gpu-flow-activation-target="true"
              data-testid="param-input"
              onClick={mocks.paramInputActivationClick}
            />
          </div>
        </>
      );
    }
    if (mocks.paramInputRenderMode.current === "explicit-button-role-target") {
      return (
        <div data-gpu-flow-interactive="true" data-testid="param-input-wrapper">
          <button
            type="button"
            role="button"
            data-gpu-flow-activation-target="true"
            data-testid="param-input"
            onClick={mocks.paramInputActivationClick}
          />
        </div>
      );
    }
    if (mocks.paramInputRenderMode.current === "explicit-switch-role-target") {
      return (
        <div data-gpu-flow-interactive="true" data-testid="param-input-wrapper">
          <button
            type="button"
            role="switch"
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
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
} from "./projectGpuPortalAdapter";
import { renderProjectGpuDomIsland } from "./projectGpuRetainedParamDomIslandRenderer";
import {
  getProjectRetainedContentConnectionOptions,
  getProjectRetainedContentInteractionOptions,
  getProjectScenePortConnectionOptions,
  getProjectScenePortConnectionPolicy,
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

  it("reveals retained password values from canvas without mounting a DOM island", async () => {
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
    const onActiveParamCanvasPopupChange = vi.fn();
    const onActiveParamCanvasControlChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
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
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      onActiveParamCanvasControlChange,
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onPasswordRevealStateChange,
      onRetainedParamDragPreviewChange: vi.fn(),
      passwordRevealStates: new Map(),
      retainedContentScroll: {
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
        onScrollOffsetsChange: vi.fn(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });
    const event = {
      hit: revealHit,
      localPoint: {
        x: revealHit.rect.x + revealHit.rect.width / 2,
        y: revealHit.rect.y + revealHit.rect.height / 2,
      },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 210,
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
      hitRecordId: revealHit.id,
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
          control: textLikeControlDescriptor(""),
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

  it("replays retained param name activation mousedown when the point lands on island chrome", async () => {
    const activationPoint = { x: 56, y: 20 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-gpu-project-param-name-dom-island="true"]'),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPointSpy,
    });
    const rendered = await renderIsland(
      retainedParamNameIsland({
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
      expect(mocks.paramNameActivationMouseDown).toHaveBeenCalledTimes(1);
      expect(mocks.paramNameActivationMouseDown).toHaveBeenCalledWith(
        expect.objectContaining({
          clientX: activationPoint.x,
          clientY: activationPoint.y,
        }),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
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
