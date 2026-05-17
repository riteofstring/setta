/* @vitest-environment jsdom */

import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuDomIsland } from "gpuFlow/scene";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTypeErrors } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  displayOnlyTimeControlDescriptor,
  retainedParamIsland,
  textLikeControlDescriptor,
} from "testUtils/projectGpuRetainedParamInteractionFixtures";
import {
  EMPTY_TEST_SCENE,
  seedNestedParamNameProjectState,
  seedTimeParamProjectState,
} from "testUtils/projectGpuRetainedParamInteractionParamFixtures.test.support";
import "testUtils/reactRefreshPreamble";
import { TimeControlModeEnum } from "utils/generatedTypes";
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

import { PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID } from "./projectGpuPortalAdapter";
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

  it("records viewport client coordinates for retained browser-control activation", () => {
    const onActiveParamCanvasControlChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            ...textLikeControlDescriptor(""),
            renderOwner: "dom-owned",
          },
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
      onActiveParamCanvasControlChange,
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
    expect(onActiveParamCanvasControlChange).toHaveBeenCalledWith(null);
    expect(onActiveParamCanvasControlChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ paramInfoId: "param-1" }),
    );
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
        applyScrollOffsets: vi.fn(),
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
        applyScrollOffsets: vi.fn(),
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
        applyScrollOffsets: vi.fn(),
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
});
