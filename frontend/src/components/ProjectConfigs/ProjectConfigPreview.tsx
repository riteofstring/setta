import { getXYWidthHeight, MinimapSvg } from "gpuFlow/GpuMiniMapSvg";
import { getGpuNodesBounds } from "gpuFlow/nodeBounds";
import { ProjectConfig } from "utils/generatedTypes";

export function ProjectConfigPreview({
  topLevelSections,
}: {
  topLevelSections?: ProjectConfig["topLevelSections"] | null;
}) {
  const sectionLayouts = Object.values(topLevelSections ?? {});
  const nodes = sectionLayouts.map((section) => ({
    position: { x: section.x, y: section.y },
    width: section.w,
    height: section.h,
  }));

  const elementWidth = 200;
  const elementHeight = 150;
  const boundingRect = getGpuNodesBounds(nodes);
  const { x, y, width, height, offset } = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale: 5,
  });

  return MinimapSvg({
    elementWidth,
    elementHeight,
    x,
    y,
    width,
    height,
    offset,
    viewBB: boundingRect,
    nodes,
    nodeColor: "#d6dee8",
    nodeBorderRadius: 2,
    nodeStrokeWidth: 2,
    nodeStrokeColor: "transparent",
    maskColor: "rgba(255,255,255,0.35)",
    maskStrokeColor: "transparent",
    maskStrokeWidth: 1,
    shapeRendering: "geometricPrecision",
  });
}
