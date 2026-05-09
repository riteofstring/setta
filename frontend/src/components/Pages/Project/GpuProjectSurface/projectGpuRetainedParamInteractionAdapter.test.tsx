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
  displayOnlyTimeControlDescriptor,
  getRetainedControlHit,
  retainedContentInteractionHit,
  retainedContentTestScene,
  retainedParamIsland,
  seedButtonParamProjectState,
  textLikeControlDescriptor,
} from "testUtils/projectGpuRetainedParamInteractionFixtures";
import {
  EMPTY_TEST_SCENE,
  calendarCells,
  seedColorPickerParamProjectState,
  seedDateParamProjectState,
  seedDropdownParamProjectState,
  seedDropzoneParamProjectState,
  seedNestedParamNameProjectState,
  seedPasswordParamProjectState,
  seedRotaryParamProjectState,
  seedSliderParamProjectState,
  seedSwitchParamProjectState,
  seedTimeParamProjectState,
} from "testUtils/projectGpuRetainedParamInteractionParamFixtures.test.support";
import "testUtils/reactRefreshPreamble";
import {
  ArtifactTypeEnum,
  DropzoneModeEnum,
  TimeControlModeEnum,
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

import { PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID } from "./projectGpuPortalAdapter";
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

  it("mounts retained param inputs against the viewport CodeMirror tooltip portal", async () => {
    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          focusActiveSectionOnTextInput: false,
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

  it("replays retained canvas activation clicks into mounted native picker inputs without waiting for animation frame", async () => {
    mocks.paramInputRenderMode.current = "native-color-input";
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

  it("replays retained canvas activation clicks into mounted native time inputs", async () => {
    mocks.paramInputRenderMode.current = "time-input";
    const activationPoint = { x: 43, y: 65 };
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

  it("focuses mounted native text inputs without replaying a click", async () => {
    mocks.paramInputRenderMode.current = "text-input";
    const activationPoint = { x: 44, y: 11 };
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("focuses mounted native text inputs when the activation point lands on island chrome", async () => {
    mocks.paramInputRenderMode.current = "text-input";
    const activationPoint = { x: 44, y: 11 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-gpu-project-param-dom-island="true"]'),
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("focuses mounted native text inputs when canvas hit testing hides the island", async () => {
    mocks.paramInputRenderMode.current = "text-input";
    const activationPoint = { x: 44, y: 11 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() => null);
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("focuses mounted native textareas when the activation point lands on island chrome", async () => {
    mocks.paramInputRenderMode.current = "textarea";
    const activationPoint = { x: 45, y: 12 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-gpu-project-param-dom-island="true"]'),
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("does not activate mounted combobox role inputs as retained native targets", async () => {
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("does not activate mounted switch role controls as retained native targets", async () => {
    mocks.paramInputRenderMode.current = "switch-role-button";
    const activationPoint = { x: 45, y: 13 };
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("does not activate mounted button-role elements as retained native targets", async () => {
    mocks.paramInputRenderMode.current = "button-role-div";
    const activationPoint = { x: 45, y: 13 };
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("does not activate generic native island buttons without an explicit target", async () => {
    mocks.paramInputRenderMode.current = "plain-button";
    const activationPoint = { x: 46, y: 14 };
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
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

  it("does not replay pointer activation into an unrelated explicit target", async () => {
    mocks.paramInputRenderMode.current = "explicit-activation-target";
    const activationPoint = { x: 47, y: 15 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-testid="param-input-pointer-miss"]'),
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
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
      await cleanupRenderedIsland(rendered);
    }
  });

  it("can focus an explicit activation target without pointer replay", async () => {
    mocks.paramInputRenderMode.current = "explicit-activation-target";
    const rendered = await renderIsland(retainedParamIsland());

    try {
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
    } finally {
      await cleanupRenderedIsland(rendered);
    }
  });

  it.each([
    ["button", "explicit-button-role-target"],
    ["switch", "explicit-switch-role-target"],
  ] as const)(
    "does not activate explicit canvas-owned %s role targets",
    async (_role, renderMode) => {
      mocks.paramInputRenderMode.current = renderMode;
      const activationPoint = { x: 49, y: 17 };
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
        expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
        expect(document.activeElement).not.toBe(
          rendered.host.querySelector('[data-testid="param-input"]'),
        );
      } finally {
        Object.defineProperty(document, "elementFromPoint", {
          configurable: true,
          value: originalElementFromPoint,
        });
        await cleanupRenderedIsland(rendered);
      }
    },
  );

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

  it("replays retained canvas activation mousedown into CodeMirror shells when the point lands on island chrome", async () => {
    mocks.paramInputRenderMode.current = "mousedown-activation";
    const activationPoint = { x: 55, y: 19 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() =>
      document.querySelector('[data-gpu-project-param-dom-island="true"]'),
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

  it("replays retained canvas activation mousedown into CodeMirror shells when canvas hit testing hides the island", async () => {
    mocks.paramInputRenderMode.current = "mousedown-activation";
    const activationPoint = { x: 55, y: 19 };
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPointSpy = vi.fn(() => null);
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

  it("does not activate pointer-marked legacy DOM controls", async () => {
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
      expect(mocks.paramInputActivationPointerDown).not.toHaveBeenCalled();
      expect(mocks.paramInputActivationPointerUp).not.toHaveBeenCalled();
      expect(mocks.paramInputActivationClick).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(
        rendered.host.querySelector('[data-testid="param-input"]'),
      );
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
      nativeEvent: new MouseEvent("pointerdown", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 120, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent;

    options.onHitPointerDown?.(event);

    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activation: {
          clientPoint: { x: 220, y: 96 },
          kind: "pointer",
        },
      }),
    );
    options.onHitClick({
      ...event,
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
    });
    expect(onActiveParamDomIslandChange).toHaveBeenCalledTimes(1);
  });

  it("records retained param name DOM island activation from pointerdown", () => {
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

    options.onHitPointerDown?.({
      hit: labelHit,
      localPoint: { x: 12, y: 14 },
      nativeEvent: new MouseEvent("pointerdown", {
        clientX: 32,
        clientY: 18,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 12, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
    } satisfies GpuRetainedContentInteractionEvent);

    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith({
      activation: {
        clientPoint: { x: 32, y: 18 },
        kind: "pointer",
      },
      hitRecordId: "label:param-1",
      paramInfoId: "param-1",
      sectionId: "section-1",
      surfaceId: "section-1:param-content:unpinned",
    });
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
          control: textLikeControlDescriptor(""),
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
          control: displayOnlyTimeControlDescriptor(),
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
        onScrollOffsetsChange: vi.fn(),
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
        onScrollOffsetsChange: vi.fn(),
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
        onScrollOffsetsChange: vi.fn(),
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
        onScrollOffsetsChange: vi.fn(),
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
        onScrollOffsetsChange: vi.fn(),
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
        onScrollOffsetsChange: vi.fn(),
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
