import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import type { GpuEdgeScene } from "../edges/edgeSources";
import type { GpuEdgePaletteInput, GpuGridInput } from "../gpuPipelines";
import type {
  GpuHtmlSurfaceOverlayLayout,
  GpuNodeLayout,
  GpuNodeUploadBudget,
} from "../htmlSurfaces/frame";
import type {
  HtmlSurfaceSolidRoundedRectVisual,
  HtmlSurfaceVisualScene,
} from "../htmlSurfaces/visualScene";
import type { GpuFlowScene } from "../scene";
import type { GpuViewportInput } from "../viewportMath";

export type GpuFlowNodeLayerState = {
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly edgePalette: GpuEdgePaletteInput | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly forceVisibleNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly edgeLabelSurfaces:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly marginCssPx: number | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly nodeTextureMemoryBudgetBytes: number | undefined;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
};
