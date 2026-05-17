import type { CSSProperties, ReactNode } from "react";
import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import type { GpuEdgeScene } from "../edges/edgeSources";
import type { GpuFlowFramePerformanceReporter } from "../framePerformance";
import type { GpuEdgePaletteInput, GpuGridInput } from "../gpuPipelines";
import type { GpuSurfaceProps } from "../GpuSurface";
import type {
  GpuNodeLayout,
  GpuNodeUploadBudget,
  RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";
import type { GpuEdgeReconnectOptions } from "../interactions/edgeReconnect";
import type { GpuEdgeInteractionControllerOptions } from "../interactions/edges";
import type { GpuNodeDragControllerOptions } from "../interactions/nodeDrag";
import type { GpuPanZoomControllerOptions } from "../interactions/panZoom";
import type { GpuSectionSceneScrollControllerOptions } from "../interactions/sceneScroll";
import type { GpuSelectionControllerOptions } from "../interactions/selection";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import type { GpuFlowPortalDescriptor } from "../portals/portalManager";
import type { GpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import type { GpuFlowDomIslandRenderer } from "./domIslandLayer";
import type { GpuFlowNodeResizeOptions } from "./flowNodeResizeController";
import type {
  GpuFlowRetainedContentConnectionOptions,
  GpuFlowRetainedContentInteractionOptions,
  GpuFlowRetainedContentKeyboardOptions,
  GpuFlowRetainedContentScrollOptions,
  GpuFlowScenePortConnectionOptions,
} from "./retainedContentControllers";
import type { GpuRetainedDomControlRenderer } from "./retainedDomControlSources";
import type { GpuFlowSelectionDragOptions } from "./selectionDragLayer";

export type GpuFlowProps = Pick<
  GpuSurfaceProps,
  "deviceOptions" | "onFrame" | "onPaint" | "onReady" | "onResize"
> & {
  children?: ReactNode;
  className?: string | undefined;
  edgeInteraction?:
    | false
    | Omit<
        GpuEdgeInteractionControllerOptions,
        "element" | "getScene" | "store"
      >
    | undefined;
  edgePalette?: GpuEdgePaletteInput | undefined;
  edgeReconnect?: false | GpuEdgeReconnectOptions | undefined;
  edgeScene?: GpuEdgeScene | undefined;
  edges?: readonly GpuEdgeBufferInput[] | undefined;
  framePerformanceReporter?: GpuFlowFramePerformanceReporter | undefined;
  forceVisibleNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  grid?: GpuGridInput | undefined;
  layoutStore?: GpuFlowLayoutStoreApi | undefined;
  marginCssPx?: number | undefined;
  nodeClassName?: string | undefined;
  nodeTextureMemoryBudgetBytes?: number | undefined;
  onNodeElementChange?:
    | ((nodeId: string, element: HTMLElement | null) => void)
    | undefined;
  nodeDrag?:
    | false
    | Omit<
        GpuNodeDragControllerOptions,
        "element" | "layoutStore" | "requestFrame" | "store"
      >
    | undefined;
  nodeResize?: GpuFlowNodeResizeOptions;
  onNodeLayerFrame?:
    | ((result: RenderHtmlSurfaceFrameResult) => void)
    | undefined;
  onRetainedRuntimeFrame?:
    | ((frame: GpuRetainedRuntimeFrame) => void)
    | undefined;
  panZoom?:
    | false
    | Omit<
        GpuPanZoomControllerOptions,
        "element" | "requestFrame" | "store" | "viewportRuntime"
      >
    | undefined;
  portals?: readonly GpuFlowPortalDescriptor[] | undefined;
  renderNode?: ((node: GpuNodeLayout) => ReactNode) | undefined;
  selection?:
    | false
    | Omit<GpuSelectionControllerOptions, "element" | "getNodes" | "store">
    | undefined;
  selectionDrag?: GpuFlowSelectionDragOptions;
  scene?: GpuFlowScene | undefined;
  scenePortConnection?: GpuFlowScenePortConnectionOptions;
  sceneScroll?:
    | false
    | Omit<
        GpuSectionSceneScrollControllerOptions,
        "element" | "getScene" | "requestFrame" | "store"
      >
    | undefined;
  retainedContentInteraction?: GpuFlowRetainedContentInteractionOptions;
  retainedContentConnection?: GpuFlowRetainedContentConnectionOptions;
  retainedContentKeyboard?: GpuFlowRetainedContentKeyboardOptions;
  retainedContentRuntimeState?: GpuRetainedContentRuntimeState | undefined;
  retainedContentScroll?: GpuFlowRetainedContentScrollOptions;
  renderDomIsland?: GpuFlowDomIslandRenderer | undefined;
  style?: CSSProperties | undefined;
  surfaceClassName?: string | undefined;
  renderRetainedDomControl?: GpuRetainedDomControlRenderer | undefined;
  uploadBudget?: GpuNodeUploadBudget | undefined;
  viewport?: GpuViewportInput | undefined;
  viewportStore?: GpuFlowViewportStoreApi | undefined;
};

export type GpuFlowCallbacks = Pick<
  GpuFlowProps,
  | "onFrame"
  | "onNodeElementChange"
  | "onNodeLayerFrame"
  | "onPaint"
  | "onReady"
  | "onRetainedRuntimeFrame"
  | "onResize"
> & {
  readonly framePerformanceReporter:
    | GpuFlowFramePerformanceReporter
    | undefined;
};

export const EMPTY_GPU_NODE_LAYOUTS: readonly GpuNodeLayout[] = [];
