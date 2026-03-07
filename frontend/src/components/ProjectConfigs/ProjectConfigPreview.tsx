import { getNodesBounds } from "forks/xyflow/core/utils/graph";
import { getXYWidthHeight, MinimapSvg } from "forks/xyflow/minimap/MiniMap";
import { ProjectConfig } from "utils/generatedTypes";

export function ProjectConfigPreview({
  topLevelSections,
}: {
  topLevelSections: ProjectConfig["topLevelSections"];
}) {
  const sectionLayouts = Object.values(topLevelSections);
  const nodes = sectionLayouts.map((section, index) => ({
    id: `preview-node-${index}`,
    position: { x: section.x, y: section.y },
    width: section.w,
    height: section.h,
    zIndex: 0,
    tempZIndex: 0,
  }));

  const elementWidth = 200;
  const elementHeight = 150;
  const boundingRect = getNodesBounds(nodes);
  const { x, y, width, height, offset } = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale: 5,
  });

  return (
    <MinimapSvg
      elementWidth={elementWidth}
      elementHeight={elementHeight}
      x={x}
      y={y}
      width={width}
      height={height}
      offset={offset}
      nodes={nodes}
      nodeColor="#d6dee8"
      nodeBorderRadius={2}
      nodeStrokeWidth={2}
      nodeStrokeColor="transparent"
      maskColor="rgba(255,255,255,0.35)"
      maskStrokeColor="transparent"
      maskStrokeWidth={1}
    />
  );
}
