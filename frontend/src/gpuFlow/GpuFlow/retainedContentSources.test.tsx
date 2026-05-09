/* @vitest-environment jsdom */

import {
  act,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuNodeDomTransformSyncCache,
  markHtmlSurfaceFramePaintDirty,
} from "../htmlSurfaces/frame";
import {
  createGpuRetainedRowContentScene,
  createGpuRetainedRowContentSceneWithScrollOffset,
  type GpuRetainedContentControlDescriptor,
  type GpuRetainedContentScene,
} from "../retainedContentScene";
import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { useGpuFlowRetainedContentSources } from "./retainedContentSources";

let root: Root | null = null;

describe("GpuFlow retained content sources", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("keeps unrelated retained surfaces clean when one retained source redraws", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      createCanvasContextStub() as never,
    );
    const dirtyEvents: Array<{
      readonly sourceRect:
        | { readonly height: number; readonly width: number }
        | undefined;
      readonly surfaceId: string;
    }> = [];
    const harnessRef = {
      current: null as RetainedContentSourcesHarnessApi | null,
    };

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentSourcesHarness
          onDirtySurface={(event) => {
            dirtyEvents.push(event);
          }}
          ref={(api) => {
            harnessRef.current = api;
          }}
        />,
      );
    });

    if (!harnessRef.current) {
      throw new Error("Expected retained content source harness to mount.");
    }

    dirtyEvents.length = 0;

    act(() => {
      harnessRef.current?.scrollFirstSurface();
    });

    expect(dirtyEvents).toEqual([]);
  });
});

type RetainedContentSourcesHarnessApi = {
  readonly scrollFirstSurface: () => void;
};

const RetainedContentSourcesHarness = forwardRef<
  RetainedContentSourcesHarnessApi,
  {
    readonly onDirtySurface: (event: {
      readonly sourceRect:
        | { readonly height: number; readonly width: number }
        | undefined;
      readonly surfaceId: string;
    }) => void;
  }
>(function RetainedContentSourcesHarness({ onDirtySurface }, ref) {
  const [scrollY, setScrollY] = useState(0);
  const activeResizeNodeIdRef = useRef<string | null>(null);
  const nodeDomTransformSyncCacheRef = useRef(
    createGpuNodeDomTransformSyncCache(),
  );
  const nodeElementByIdRef = useRef(new Map<string, HTMLElement>());
  const transformOnlyPaintNodeIdsRef = useRef(new Set<string>());
  const textureManagerRef = useRef({
    destroySurfaceTexture: vi.fn(),
    markSurfaceTextureDirty: ({
      sourceRect,
      surfaceId,
    }: {
      readonly sourceRect?:
        | { readonly height: number; readonly width: number }
        | undefined;
      readonly surfaceId: string;
    }) => {
      onDirtySurface({ sourceRect, surfaceId });
    },
  });
  const surfaceRef = useRef({
    getRuntime: () => null,
    requestFrame: vi.fn(),
    requestPaint: () => {
      markHtmlSurfaceFramePaintDirty({
        changedElements: [...nodeElementByIdRef.current.values()],
        elementByNodeId: nodeElementByIdRef.current,
        frame: 1,
        ignoreDirectNodeIds: transformOnlyPaintNodeIdsRef.current,
        textureManager: textureManagerRef.current,
      });
    },
  });
  const switchAnimations = useMemo(
    () => createGpuRetainedContentSwitchAnimationStore(),
    [],
  );
  const stableFirstScene = useMemo(
    () =>
      retainedScene({
        id: "dict-a:param-content:unpinned",
        ownerSectionId: "dict-a",
        scrollY: 0,
        width: 160,
      }),
    [],
  );
  const scene = useMemo<GpuFlowScene>(
    () => ({
      contentSurfaces: [
        retainedSurface({
          id: "dict-a:param-content:unpinned",
          ownerSectionId: "dict-a",
          retainedScene:
            scrollY === 0
              ? stableFirstScene
              : createGpuRetainedRowContentSceneWithScrollOffset({
                  scene: stableFirstScene,
                  scrollOffset: { x: 0, y: scrollY },
                }),
          scrollY,
          x: 0,
        }),
        retainedSurface({
          id: "dict-b:param-content:unpinned",
          ownerSectionId: "dict-b",
          scrollY: 0,
          x: 240,
        }),
      ],
      domIslands: [],
      edges: [],
      revision: scrollY,
      sections: [],
    }),
    [scrollY, stableFirstScene],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollFirstSurface: () => {
        setScrollY(28);
      },
    }),
    [],
  );

  const { retainedContentSourceElement } = useGpuFlowRetainedContentSources({
    activeResizeNodeIdRef,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    scene,
    surfaceRef,
    switchAnimations,
    textureManagerRef,
    transformOnlyPaintNodeIdsRef,
  });

  return <>{retainedContentSourceElement}</>;
});

function retainedSurface({
  id,
  ownerSectionId,
  retainedScene: scene,
  scrollY,
  x,
}: {
  readonly id: string;
  readonly ownerSectionId: string;
  readonly retainedScene?: GpuRetainedContentScene | undefined;
  readonly scrollY: number;
  readonly x: number;
}): GpuContentSurface {
  const rect = { height: 80, width: 160, x, y: 0 };
  return {
    clipRect: rect,
    id,
    ownerSectionId,
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: id,
    },
    retainedScene:
      scene ??
      retainedScene({
        id,
        ownerSectionId,
        scrollY,
        width: rect.width,
      }),
    zIndex: 1,
  };
}

function retainedScene({
  id,
  ownerSectionId,
  scrollY,
  width,
}: {
  readonly id: string;
  readonly ownerSectionId: string;
  readonly scrollY: number;
  readonly width: number;
}): GpuRetainedContentScene {
  return createGpuRetainedRowContentScene({
    controlWidth: 40,
    id,
    ownerSectionId,
    rowHeight: 28,
    rows: Array.from({ length: 10 }, (_, index) => ({
      control: textLikeControlDescriptor(),
      controlKind: "text-like",
      depth: 0,
      id: `param-${index}`,
      label: `Param ${index}`,
    })),
    scrollOffset: { x: 0, y: scrollY },
    viewportRect: { height: 80, width, x: 0, y: 0 },
  });
}

function textLikeControlDescriptor(): GpuRetainedContentControlDescriptor {
  return {
    commitPolicy: "native-island",
    defaultDisplayValue: "",
    displayValue: "Value 0",
    editorKind: "text",
    kind: "text-like",
    rendererFamily: "text-like",
  };
}

function createCanvasContextStub(): CanvasRenderingContext2D {
  const methods = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "canvas") {
          return document.createElement("canvas");
        }
        if (property === "measureText") {
          return vi.fn((text: string) => ({ width: text.length * 8 }));
        }
        const key = String(property);
        const existing = methods.get(key);
        if (existing) {
          return existing;
        }
        const method = vi.fn();
        methods.set(key, method);
        return method;
      },
      set() {
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}
