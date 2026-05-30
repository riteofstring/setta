import type { CSSProperties } from "react";

import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import type { GpuHtmlSurfaceOverlayLayout } from "./htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./htmlSurfaces/sourceLayer";

const GPU_EDGE_LABEL_SOURCE_CLASS_NAME = "setta-gpu-flow__edge-label-source";

export function GpuEdgeLabelSurfaceLayer({
  labels,
  onLabelElementChange,
}: {
  readonly labels: readonly GpuEdgeSceneLabel[];
  readonly onLabelElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
}) {
  if (labels.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuEdgeLabelSourceElement}
      getSourceId={getGpuEdgeLabelSurfaceId}
      onSourceElementChange={onLabelElementChange}
      renderSource={renderGpuEdgeLabelSource}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_EDGE_LABEL_SOURCE_CLASS_NAME}`}
      sources={labels}
    />
  );
}

export function getGpuEdgeLabelSurfaceLayouts(
  labels: readonly GpuEdgeSceneLabel[] | undefined,
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return (labels ?? []).map(toGpuEdgeLabelSurfaceLayout);
}

export function toGpuEdgeLabelSurfaceLayout(
  label: GpuEdgeSceneLabel,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height: label.height,
    surfaceId: getGpuEdgeLabelSurfaceId(label),
    width: label.width,
    x: label.x - label.width / 2,
    y: label.y - label.height / 2,
    zIndex: label.zIndex,
  };
}

function getGpuEdgeLabelSurfaceId(label: GpuEdgeSceneLabel): string {
  return label.id;
}

export function getGpuEdgeLabelSourceStyle(
  label: GpuEdgeSceneLabel,
): CSSProperties {
  return {
    height: label.height,
    width: label.width,
  };
}

function configureGpuEdgeLabelSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuEdgeSceneLabel>) {
  host.dataset.gpuFlowEdgeLabelSource = "true";
  host.dataset.edgeid = source.edgeId;
  host.setAttribute("data-testid", `gpu-edge-label-source-${source.id}`);
  const style = getGpuEdgeLabelSourceStyle(source);
  host.style.height = `${style.height}px`;
  host.style.width = `${style.width}px`;
}

function renderGpuEdgeLabelSource(label: GpuEdgeSceneLabel) {
  return (
    <div
      className={`setta-gpu-flow__edge-label setta-gpu-flow__edge-label--${label.kind}`}
      data-edgeid={label.edgeId}
      data-testid={`gpu-edge-label-${label.id}`}
    >
      {label.text}
    </div>
  );
}
