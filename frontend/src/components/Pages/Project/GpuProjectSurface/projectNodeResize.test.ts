/* @vitest-environment jsdom */

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { setSectionSizes } from "openapi/http";
import {
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createSettingsState,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectNodeResizeOptions,
  createProjectNodeResizeSession,
} from "./projectNodeResize";

vi.mock("@setta/app-subsystem-frontend-sdk", async () => {
  const actual = await vi.importActual<
    typeof import("@setta/app-subsystem-frontend-sdk")
  >("@setta/app-subsystem-frontend-sdk");
  return {
    ...actual,
    callOpenAPI: vi.fn((request) => request),
  };
});

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    setSectionSizes: vi.fn(),
    setTopLevelSectionLayout: vi.fn(),
  };
});

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
type CreateChatSectionImplOptions = NonNullable<
  Parameters<typeof createChatSectionImpl>[0]
>;

function createViewportDomNode() {
  const domNode = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.className = "setta-gpu-flow__canvas";
  domNode.appendChild(viewport);
  return domNode;
}

function seedProjectState(
  size = createSectionSize({
    height: 120,
    width: 200,
  }) as unknown as NonNullable<CreateChatSectionImplOptions["size"]>,
) {
  useSettings.setState(createSettingsState());
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Chat",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: "Chat Variant",
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [implId]: createChatSectionImpl({
        id: implId,
        chatId: null,
        managed: true,
        engineConfigId: "engine-1",
        thinking: true,
        size,
      }),
    };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.parentSectionMap = { [sectionId]: null };
    state.projectConfig.topLevelSections = {
      [sectionId]: { x: 0, y: 0, zIndex: 1, w: 200, h: 120 },
    };
    state.previewSectionVariantMap = {};
  });
  useNodeInternals.setState({
    x: new Map([
      [
        sectionId,
        {
          id: sectionId,
          position: { x: 0, y: 0 },
          width: 200,
          height: 120,
          zIndex: 1,
          tempZIndex: 1,
        },
      ],
    ]),
  });
  gpuFlowViewportStore.getState().setDomNode(createViewportDomNode());
}

function createResizeChange({
  phase,
  width,
  height,
}: {
  phase: "start" | "resize" | "stop";
  width: number;
  height: number;
}) {
  return {
    active: phase !== "stop",
    direction: "bottomRight" as const,
    layout: {
      height,
      nodeId: sectionId,
      width,
      x: 0,
      y: 0,
      zIndex: 1,
    },
    nodeId: sectionId,
    phase,
    pointerDelta: { x: width - 200, y: height - 120 },
    sizeDelta: { width: width - 200, height: height - 120 },
    startLayout: {
      height: 120,
      nodeId: sectionId,
      width: 200,
      x: 0,
      y: 0,
      zIndex: 1,
    },
    totalSizeDelta: { width: width - 200, height: height - 120 },
  };
}

describe("project GPU node resize adapter", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.useFakeTimers();
    seedProjectState();
    vi.mocked(setSectionSizes).mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof setSectionSizes>,
    );
  });

  afterEach(() => {
    const domNode = gpuFlowViewportStore.getState().domNode;
    if (domNode) {
      gpuFlowViewportStore.getState().clearDomNode(domNode);
    }
    resetProjectStores();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("applies live graph size on resize frames and persists section size only on stop", () => {
    const sessionRef = { current: createProjectNodeResizeSession() };
    const options = createProjectNodeResizeOptions({
      canEditLayout: true,
      flowInteractionKeys: {
        panActivationKeyPressed: false,
        selectionKeyPressed: false,
        zoomActivationKeyPressed: false,
      },
      isFollowTransitioning: false,
      sessionRef,
    });

    options.onNodeResizeStart(
      createResizeChange({ phase: "start", width: 200, height: 120 }),
    );
    options.onNodeResize(
      createResizeChange({ phase: "resize", width: 500, height: 260 }),
    );

    const liveNode = useNodeInternals.getState().x.get(sectionId);
    expect(liveNode?.width).toBe(500);
    expect(liveNode?.height).toBe(260);
    expect(setSectionSizes).not.toHaveBeenCalled();

    options.onNodeResizeStop(
      createResizeChange({ phase: "stop", width: 500, height: 260 }),
    );

    expect(setSectionSizes).toHaveBeenCalledOnce();
    expect(vi.mocked(setSectionSizes).mock.calls[0]?.[0]).toMatchObject({
      body: {
        projectConfigId,
        sectionSizes: {
          [sectionId]: { width: 500, height: 260 },
        },
      },
    });
  });

  it("restores auto-size promotion after a no-op handle press", () => {
    resetProjectStores();
    seedProjectState(
      createSectionSize({
        height: "auto",
        width: 200,
      }) as unknown as NonNullable<CreateChatSectionImplOptions["size"]>,
    );
    const sessionRef = { current: createProjectNodeResizeSession() };
    const options = createProjectNodeResizeOptions({
      canEditLayout: true,
      flowInteractionKeys: {
        panActivationKeyPressed: false,
        selectionKeyPressed: false,
        zoomActivationKeyPressed: false,
      },
      isFollowTransitioning: false,
      sessionRef,
    });

    options.onNodeResizeStart(
      createResizeChange({ phase: "start", width: 200, height: 120 }),
    );
    options.onNodeResizeStop(
      createResizeChange({ phase: "stop", width: 200, height: 120 }),
    );

    const impl = useProjectState.getState().sectionImpls[implId];
    expect(impl?.size.height).toBe("auto");
    expect(setSectionSizes).not.toHaveBeenCalled();
  });
});
