import type { MutableRefObject } from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import type { HtmlSurfaceEffectHitProjector } from "../htmlSurfaces/hitScene";
import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";
import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";
import {
  attachGpuNodeResizeController,
  type GpuNodeResizeControllerOptions,
} from "../interactions/nodeResize";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuFlowScene } from "../scene";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

import { resolveGpuFlowNodeResizeTarget } from "./nodeResizeTarget";

export type GpuFlowNodeResizeOptions =
  | false
  | Omit<
      GpuNodeResizeControllerOptions,
      | "element"
      | "layoutStore"
      | "requestFrame"
      | "resolveResizeTarget"
      | "store"
    >
  | undefined;

type GpuFlowNodeResizeLayerState = {
  readonly scene: GpuFlowScene | undefined;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
};

export function attachGpuFlowNodeResizeController({
  activeResizeNodeIdRef,
  element,
  htmlSurfaceEffectProjectors,
  layoutStore,
  nodeElementByIdRef,
  nodeLayerRef,
  nodeResizeRef,
  sourceInteractionProjector,
  surfaceRef,
  viewportStore,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly element: HTMLElement;
  readonly htmlSurfaceEffectProjectors: ReadonlyMap<
    string,
    HtmlSurfaceEffectHitProjector
  >;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeResizeLayerState>;
  readonly nodeResizeRef: MutableRefObject<GpuFlowNodeResizeOptions>;
  readonly sourceInteractionProjector: HtmlSurfaceInteractionProjector;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}): () => void {
  const getCurrentNodeResizeOptions = () => {
    const currentNodeResize = nodeResizeRef.current;
    return currentNodeResize === false ? undefined : currentNodeResize;
  };
  const initialNodeResizeOptions = getCurrentNodeResizeOptions();
  return attachGpuNodeResizeController({
    ...(initialNodeResizeOptions ?? {}),
    element,
    disabled: () => {
      const disabled = getCurrentNodeResizeOptions()?.disabled;
      if (typeof disabled === "function") {
        return disabled();
      }
      return Boolean(disabled);
    },
    getResizePolicy: (input) =>
      getCurrentNodeResizeOptions()?.getResizePolicy?.(input),
    layoutStore,
    onNodeResize: (change) => {
      getCurrentNodeResizeOptions()?.onNodeResize?.(change);
    },
    onNodeResizeCancel: (change) => {
      getCurrentNodeResizeOptions()?.onNodeResizeCancel?.(change);
      activeResizeNodeIdRef.current = null;
    },
    onNodeResizeStart: (change) => {
      activeResizeNodeIdRef.current = change.nodeId;
      getCurrentNodeResizeOptions()?.onNodeResizeStart?.(change);
    },
    onNodeResizeStop: (change) => {
      getCurrentNodeResizeOptions()?.onNodeResizeStop?.(change);
      activeResizeNodeIdRef.current = null;
    },
    requestFrame: (reason) => {
      surfaceRef.current?.requestFrame(reason);
    },
    resolveResizeTarget: (event) =>
      resolveGpuFlowNodeResizeTarget({
        event,
        elementByNodeId: nodeElementByIdRef.current,
        effectProjectors: htmlSurfaceEffectProjectors,
        nodes: layoutStore.getState().getNodes(),
        sourceInteractionProjector,
        surfaceElement: element,
        viewport: viewportStore.getState().transform,
        visualScene: nodeLayerRef.current.visualScene,
        requireVisualSceneHitSurfaces: nodeLayerRef.current.scene !== undefined,
      }),
    store: viewportStore,
  });
}
