/* @vitest-environment jsdom */

import { act, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import { useGpuFlowRetainedContentControllers } from "./retainedContentControllers";

let root: Root | null = null;

describe("GpuFlow retained content controllers", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

  it("keeps click activation live when pointerdown rerenders retained interaction options", () => {
    const onHitClick = vi.fn();
    let host: HTMLDivElement | null = null;

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentInteractionHarness
          onHostChange={(element) => {
            host = element;
          }}
          onHitClick={onHitClick}
        />,
      );
    });

    if (!host) {
      throw new Error("Expected retained content interaction host to mount.");
    }

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 140,
      clientY: 14,
      pointerId: 1,
    });
    const pointerUp = createPointerEvent("pointerup", {
      clientX: 140,
      clientY: 14,
      pointerId: 1,
    });
    const click = createMouseEvent("click", {
      clientX: 140,
      clientY: 14,
    });

    act(() => {
      host?.dispatchEvent(pointerDown);
    });
    act(() => {
      host?.dispatchEvent(pointerUp);
    });
    act(() => {
      host?.dispatchEvent(click);
    });

    expect(onHitClick).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-0",
          kind: "control",
          ownerRowId: "param-0",
        }),
        ownerSectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      }),
    );
    expect(click.defaultPrevented).toBe(true);
  });
});

function RetainedContentInteractionHarness({
  onHitClick,
  onHostChange,
}: {
  readonly onHitClick: ReturnType<typeof vi.fn>;
  readonly onHostChange: (element: HTMLDivElement | null) => void;
}) {
  const [revision, setRevision] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeLayerRef = useRef<{ scene: GpuFlowScene | undefined }>({
    scene: retainedContentScene(revision),
  });
  nodeLayerRef.current.scene = retainedContentScene(revision);
  const nodeElementByIdRef = useRef(new Map<string, HTMLElement>());
  const surfaceRef = useRef({
    getRuntime: () => null,
    requestFrame: vi.fn(),
    requestPaint: vi.fn(),
  });
  const textureManagerRef = useRef(null);
  const viewportStore = useMemo(() => createGpuFlowViewportStore(), []);
  const switchAnimations = useMemo(
    () => createGpuRetainedContentSwitchAnimationStore(),
    [],
  );

  useGpuFlowRetainedContentControllers({
    containerRef,
    layoutStore: null,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentConnection: false,
    retainedContentInteraction: {
      onHitClick,
      onHitPointerDown: () => {
        setRevision((current) => current + 1);
      },
    },
    retainedContentKeyboard: false,
    retainedContentScroll: false,
    retainedContentSwitchAnimations: switchAnimations,
    scenePortConnection: false,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  });

  return (
    <div
      ref={(element) => {
        containerRef.current = element;
        onHostChange(element);
      }}
    />
  );
}

function retainedContentScene(revision: number): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-0",
          label: "Param 0",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
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

function createPointerEvent(
  type: string,
  init: {
    readonly button?: number | undefined;
    readonly buttons?: number | undefined;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? (type === "pointerup" ? 0 : 1) },
    isPrimary: { value: true },
    pointerId: { value: init.pointerId },
    pointerType: { value: "mouse" },
  });
  return event;
}

function createMouseEvent(
  type: string,
  init: {
    readonly clientX: number;
    readonly clientY: number;
  },
): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
}
