/* @vitest-environment jsdom */

import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuSectionSceneLayoutMode,
  type GpuSectionSceneNode,
} from "gpuFlow/scene";
import { resolveGpuFlowSceneLayout } from "gpuFlow/sceneLayout";
import type { GpuPoint, GpuRect } from "gpuFlow/viewportMath";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { setSectionSizes } from "openapi/http";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toTopLevelSectionOuterDimension } from "state/actions/sectionInfos/topLevelSectionNode";
import {
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
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
  getProjectNodeResizePolicy,
  useProjectNodeResizeOptions,
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
const STABLE_FLOW_INTERACTION_KEYS = {
  panActivationKeyPressed: false,
  selectionKeyPressed: false,
  zoomActivationKeyPressed: false,
};
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
  layoutSize: { height?: number; width?: number } = {},
) {
  const sectionWidth = typeof size.width === "number" ? size.width : 200;
  const sectionHeight = typeof size.height === "number" ? size.height : 120;
  const layoutWidth = layoutSize.width ?? sectionWidth;
  const layoutHeight = layoutSize.height ?? sectionHeight;
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
      [sectionId]: {
        x: 0,
        y: 0,
        zIndex: 1,
        w: layoutWidth,
        h: layoutHeight,
      },
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
          width: toTopLevelSectionOuterDimension(layoutWidth),
          height: toTopLevelSectionOuterDimension(layoutHeight),
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
  direction = "bottomRight",
  startWidth = toTopLevelSectionOuterDimension(200),
  startHeight = toTopLevelSectionOuterDimension(120),
}: {
  phase: "start" | "resize" | "stop" | "cancel";
  width: number;
  height: number;
  direction?: "right" | "bottom" | "bottomRight";
  startWidth?: number;
  startHeight?: number;
}) {
  return {
    active: phase === "start" || phase === "resize",
    direction,
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
    pointerDelta: { x: width - startWidth, y: height - startHeight },
    sizeDelta: { width: width - startWidth, height: height - startHeight },
    startLayout: {
      height: startHeight,
      nodeId: sectionId,
      width: startWidth,
      x: 0,
      y: 0,
      zIndex: 1,
    },
    totalSizeDelta: {
      width: width - startWidth,
      height: height - startHeight,
    },
  };
}

function createSceneResizeChange({
  direction = "bottomRight",
  height,
  nodeId,
  phase,
  startHeight,
  startWidth,
  width,
}: {
  readonly direction?: "right" | "bottom" | "bottomRight" | undefined;
  readonly height: number;
  readonly nodeId: string;
  readonly phase: "start" | "resize" | "stop" | "cancel";
  readonly startHeight: number;
  readonly startWidth: number;
  readonly width: number;
}) {
  return {
    active: phase === "start" || phase === "resize",
    direction,
    layout: {
      height,
      nodeId,
      width,
      x: 0,
      y: 0,
      zIndex: 1,
    },
    nodeId,
    phase,
    pointerDelta: { x: width - startWidth, y: height - startHeight },
    sizeDelta: { width: width - startWidth, height: height - startHeight },
    startLayout: {
      height: startHeight,
      nodeId,
      width: startWidth,
      x: 0,
      y: 0,
      zIndex: 1,
    },
    totalSizeDelta: {
      width: width - startWidth,
      height: height - startHeight,
    },
  };
}

function sceneWithSections(
  sections: readonly GpuSectionSceneNode[],
): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections,
  };
}

function sectionNode({
  childIds = [],
  childLayoutGap = { x: 0, y: 0 },
  id,
  layoutMode = "none",
  localRect,
  parentId = null,
  resizePolicy,
  scrollOffset = { x: 0, y: 0 },
  worldRect = rect(0, 0, 100, 80),
}: {
  readonly childIds?: readonly string[] | undefined;
  readonly childLayoutGap?: GpuPoint | undefined;
  readonly id: string;
  readonly layoutMode?: GpuSectionSceneLayoutMode | undefined;
  readonly localRect?: GpuRect | undefined;
  readonly parentId?: string | null | undefined;
  readonly resizePolicy?: Partial<GpuSectionSceneNode["resizePolicy"]>;
  readonly scrollOffset?: GpuPoint | undefined;
  readonly worldRect?: GpuRect | undefined;
}): GpuSectionSceneNode {
  const resolvedLocalRect =
    localRect ?? rect(0, 0, worldRect.width, worldRect.height);
  return {
    bodyRect: worldRect,
    childLayout: { gap: childLayoutGap },
    childSectionIds: childIds,
    childViewportRect: childIds.length > 0 ? worldRect : null,
    chromeRect: worldRect,
    clipRect: worldRect,
    contentRenderer: { kind: "dom-section", surfaceId: id },
    dirty: [],
    height: worldRect.height,
    interactionLayer: "content",
    layoutMode,
    localRect: resolvedLocalRect,
    nodeId: id,
    parentSectionId: parentId,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 100_000,
      maxWidth: 100_000,
      minHeight: 0,
      minWidth: 0,
      ...resizePolicy,
    },
    scrollOffset,
    sectionId: id,
    width: worldRect.width,
    worldRect,
    x: worldRect.x,
    y: worldRect.y,
    zIndex: 0,
  };
}

function rect(x: number, y: number, width: number, height: number): GpuRect {
  return { height, width, x, y };
}

function ResizeOptionsProbe({
  onOptions,
  scene,
}: {
  readonly onOptions: (options: unknown) => void;
  readonly scene: GpuFlowScene;
}) {
  const options = useProjectNodeResizeOptions({
    canEditLayout: true,
    flowInteractionKeys: { ...STABLE_FLOW_INTERACTION_KEYS },
    isFollowTransitioning: false,
    scene,
  });
  onOptions(options);
  return null;
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

  it("leaves live resize frames in GpuFlow and commits project size only on stop", () => {
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
      createResizeChange({ phase: "start", width: 202, height: 122 }),
    );
    options.onNodeResize(
      createResizeChange({ phase: "resize", width: 502, height: 262 }),
    );

    const projectNodeBeforeStop = useNodeInternals.getState().x.get(sectionId);
    expect(projectNodeBeforeStop?.width).toBe(
      toTopLevelSectionOuterDimension(200),
    );
    expect(projectNodeBeforeStop?.height).toBe(
      toTopLevelSectionOuterDimension(120),
    );
    expect(setSectionSizes).not.toHaveBeenCalled();

    options.onNodeResizeStop(
      createResizeChange({ phase: "stop", width: 502, height: 262 }),
    );

    expect(useNodeInternals.getState().x.get(sectionId)).toMatchObject({
      width: 502,
      height: 262,
    });
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

  it("reconciles renderer-owned nested scene layout during live resize frames", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["child-a", "child-b"],
          childLayoutGap: { x: 0, y: 8 },
          id: "parent",
          layoutMode: "vertical",
          worldRect: rect(0, 0, 180, 220),
        }),
        sectionNode({
          id: "child-a",
          localRect: rect(0, 0, 120, 50),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-b",
          localRect: rect(0, 0, 120, 40),
          parentId: "parent",
        }),
      ]),
    );
    const layoutStore = createGpuFlowLayoutStore({
      nodes: getGpuFlowSceneDomSectionNodes(scene),
    });
    const sessionRef = { current: createProjectNodeResizeSession() };
    const options = createProjectNodeResizeOptions({
      canEditLayout: true,
      flowInteractionKeys: {
        panActivationKeyPressed: false,
        selectionKeyPressed: false,
        zoomActivationKeyPressed: false,
      },
      isFollowTransitioning: false,
      layoutStore,
      scene,
      sessionRef,
    });

    options.onNodeResize(
      createSceneResizeChange({
        height: 90,
        nodeId: "child-a",
        phase: "resize",
        startHeight: 50,
        startWidth: 120,
        width: 120,
      }),
    );

    expect(layoutStore.getState().getNode("child-a")).toMatchObject({
      height: 90,
      width: 120,
      x: 0,
      y: 0,
    });
    expect(layoutStore.getState().getNode("child-b")).toMatchObject({
      height: 40,
      width: 120,
      x: 0,
      y: 98,
    });
    expect(layoutStore.getState().lastChange).toMatchObject({
      phase: "change",
      reason: "resize",
    });
  });

  it("resolves live resize constraints from section scene metadata", () => {
    const node = sectionNode({
      id: sectionId,
      resizePolicy: {
        aspectRatio: true,
        aspectRatioExtraHeight: 12,
        aspectRatioExtraWidth: 4,
        directions: ["right"],
        maxHeight: 90,
        maxWidth: 320,
        minHeight: 30,
        minWidth: 40,
      },
    });

    expect(
      getProjectNodeResizePolicy(
        { direction: "right", node, nodeId: sectionId },
        { canEditLayout: true },
      ),
    ).toMatchObject({
      aspectRatio: true,
      aspectRatioExtraHeight: 12,
      aspectRatioExtraWidth: 4,
      directions: ["right"],
      maxHeight: 90,
      maxWidth: 320,
      minHeight: 30,
      minWidth: 40,
    });
    expect(
      getProjectNodeResizePolicy(
        { direction: "bottom", node, nodeId: sectionId },
        { canEditLayout: true },
      ),
    ).toBe(false);
    expect(
      getProjectNodeResizePolicy(
        {
          direction: "right",
          node: sectionNode({
            id: sectionId,
            resizePolicy: {
              locked: true,
            },
          }),
          nodeId: sectionId,
        },
        { canEditLayout: true },
      ),
    ).toBe(false);
  });

  it("resolves height resize constraints from resize-start dimensions for auto-height sections", () => {
    seedProjectState(
      createSectionSize({
        height: "auto",
        width: 200,
      }) as unknown as NonNullable<CreateChatSectionImplOptions["size"]>,
    );
    const sceneAutoMaxHeight = toTopLevelSectionOuterDimension(
      useSettings.getState().sectionSizingPolicy.globals.autoMaxHeight,
    );
    const policyMaxHeight = toTopLevelSectionOuterDimension(
      useSettings.getState().sectionSizingPolicy.byType.Chat.maxHeight,
    );
    const node = sectionNode({
      id: sectionId,
      resizePolicy: {
        directions: ["bottom", "bottomRight"],
        maxHeight: sceneAutoMaxHeight,
      },
    });

    const policy = getProjectNodeResizePolicy(
      { direction: "bottom", node, nodeId: sectionId },
      { canEditLayout: true },
    );

    expect(policy).not.toBe(false);
    expect(policy && policy.maxHeight).toBe(policyMaxHeight);
    expect(policy && policy.maxHeight).toBeGreaterThan(sceneAutoMaxHeight);
  });

  it("keeps hook resize handlers stable while only the scene source changes", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);
    const options: unknown[] = [];
    const sceneA = sceneWithSections([sectionNode({ id: "section-a" })]);
    const sceneB = sceneWithSections([sectionNode({ id: "section-b" })]);

    try {
      await act(async () => {
        root?.render(
          createElement(ResizeOptionsProbe, {
            onOptions: (value) => options.push(value),
            scene: sceneA,
          }),
        );
      });
      await act(async () => {
        root?.render(
          createElement(ResizeOptionsProbe, {
            onOptions: (value) => options.push(value),
            scene: sceneB,
          }),
        );
      });
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
    }

    expect(options).toHaveLength(2);
    expect(options[1]).toBe(options[0]);
  });

  it("preserves live section width when persisting a later height-only resize", () => {
    resetProjectStores();
    seedProjectState(
      createSectionSize({
        height: 260,
        width: 200,
      }) as unknown as NonNullable<CreateChatSectionImplOptions["size"]>,
      { height: 260, width: 500 },
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
    const startWidth = toTopLevelSectionOuterDimension(500);
    const startHeight = toTopLevelSectionOuterDimension(260);
    const stopHeight = toTopLevelSectionOuterDimension(360);

    options.onNodeResizeStart(
      createResizeChange({
        direction: "bottom",
        phase: "start",
        startHeight,
        startWidth,
        width: startWidth,
        height: startHeight,
      }),
    );
    options.onNodeResize(
      createResizeChange({
        direction: "bottom",
        phase: "resize",
        startHeight,
        startWidth,
        width: startWidth,
        height: stopHeight,
      }),
    );
    options.onNodeResizeStop(
      createResizeChange({
        direction: "bottom",
        phase: "stop",
        startHeight,
        startWidth,
        width: startWidth,
        height: stopHeight,
      }),
    );

    expect(setSectionSizes).toHaveBeenCalledOnce();
    expect(vi.mocked(setSectionSizes).mock.calls[0]?.[0]).toMatchObject({
      body: {
        projectConfigId,
        sectionSizes: {
          [sectionId]: { width: 500, height: 360 },
        },
      },
    });
  });

  it("keeps project graph size on cancel and does not persist section size", () => {
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
    const startWidth = toTopLevelSectionOuterDimension(200);
    const startHeight = toTopLevelSectionOuterDimension(120);

    options.onNodeResizeStart(
      createResizeChange({
        phase: "start",
        startHeight,
        startWidth,
        width: startWidth,
        height: startHeight,
      }),
    );
    options.onNodeResize(
      createResizeChange({
        phase: "resize",
        startHeight,
        startWidth,
        width: 502,
        height: 262,
      }),
    );

    expect(useNodeInternals.getState().x.get(sectionId)).toMatchObject({
      width: startWidth,
      height: startHeight,
    });

    options.onNodeResizeCancel(
      createResizeChange({
        phase: "cancel",
        startHeight,
        startWidth,
        width: startWidth,
        height: startHeight,
      }),
    );

    expect(useNodeInternals.getState().x.get(sectionId)).toMatchObject({
      width: startWidth,
      height: startHeight,
    });
    expect(setSectionSizes).not.toHaveBeenCalled();
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
      createResizeChange({ phase: "start", width: 202, height: 122 }),
    );
    options.onNodeResizeStop(
      createResizeChange({ phase: "stop", width: 202, height: 122 }),
    );

    const impl = useProjectState.getState().sectionImpls[implId];
    expect(impl?.size.height).toBe("auto");
    expect(setSectionSizes).not.toHaveBeenCalled();
  });
});
