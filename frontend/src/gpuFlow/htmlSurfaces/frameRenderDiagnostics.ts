import {
  countHtmlSurfaceRenderCommandsByLayer,
  countHtmlSurfaceRenderCommandsByPipeline,
  countHtmlSurfaceRenderCommandsByRole,
  createHtmlSurfaceRetainedOcclusionDiagnostics,
  type HtmlSurfaceOcclusionRiskDiagnostic,
  type HtmlSurfaceRenderLayer,
  type HtmlSurfaceRenderPipelineKind,
  type HtmlSurfaceRenderRole,
} from "./displayList";
import type { HtmlSurfaceVisualScene } from "./visualScene";

export type HtmlSurfaceFrameRenderDiagnostics = {
  readonly renderCommandCountsByLayer: Readonly<
    Partial<Record<HtmlSurfaceRenderLayer, number>>
  >;
  readonly renderCommandCountsByPipeline: Readonly<
    Partial<Record<HtmlSurfaceRenderPipelineKind, number>>
  >;
  readonly renderCommandCountsByRole: Readonly<
    Partial<Record<HtmlSurfaceRenderRole, number>>
  >;
  readonly retainedContentOcclusionDiagnostics: readonly HtmlSurfaceOcclusionRiskDiagnostic[];
};

export function createHtmlSurfaceFrameRenderDiagnostics(
  visualScene: HtmlSurfaceVisualScene,
): HtmlSurfaceFrameRenderDiagnostics {
  return {
    renderCommandCountsByLayer: countHtmlSurfaceRenderCommandsByLayer(
      visualScene.displayList,
    ),
    renderCommandCountsByPipeline: countHtmlSurfaceRenderCommandsByPipeline(
      visualScene.displayList,
    ),
    renderCommandCountsByRole: countHtmlSurfaceRenderCommandsByRole(
      visualScene.displayList,
    ),
    retainedContentOcclusionDiagnostics:
      createHtmlSurfaceRetainedOcclusionDiagnostics(visualScene.displayList),
  };
}
