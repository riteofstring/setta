import type {
  ParamDictMinimapScene,
  ParamDictSceneGeometry,
  ParamDictSceneRect,
  ParamDictSceneViewport,
  ParamDictSectionScene,
} from "./paramDictSceneTypes";

export function deriveParamDictMinimapScene({
  sections,
  sceneBounds,
  viewport,
  viewportSize,
  minimapSize,
  geometry,
}: {
  sections: ParamDictSectionScene[];
  sceneBounds: ParamDictSceneRect;
  viewport: ParamDictSceneViewport | null;
  viewportSize: { width: number; height: number };
  minimapSize: { width: number; height: number };
  geometry: ParamDictSceneGeometry;
}): ParamDictMinimapScene {
  const rect = {
    x: 0,
    y: 0,
    width: minimapSize.width,
    height: minimapSize.height,
  };
  if (
    sections.length === 0 ||
    sceneBounds.width <= 0 ||
    sceneBounds.height <= 0
  ) {
    return {
      bounds: sceneBounds,
      rect,
      scale: 1,
      sections: [],
      viewportMask: null,
    };
  }
  const drawableWidth = Math.max(1, rect.width - geometry.minimapPadding * 2);
  const drawableHeight = Math.max(1, rect.height - geometry.minimapPadding * 2);
  const scale = Math.min(
    drawableWidth / sceneBounds.width,
    drawableHeight / sceneBounds.height,
  );
  const offsetX =
    rect.x +
    geometry.minimapPadding +
    (drawableWidth - sceneBounds.width * scale) / 2;
  const offsetY =
    rect.y +
    geometry.minimapPadding +
    (drawableHeight - sceneBounds.height * scale) / 2;
  const toMinimapRect = (source: ParamDictSceneRect): ParamDictSceneRect => ({
    x: offsetX + (source.x - sceneBounds.x) * scale,
    y: offsetY + (source.y - sceneBounds.y) * scale,
    width: source.width * scale,
    height: source.height * scale,
  });
  return {
    bounds: sceneBounds,
    rect,
    scale,
    sections: sections.map((section) => ({
      sectionId: section.id,
      rect: toMinimapRect(section.bounds),
    })),
    viewportMask: viewport
      ? toMinimapRect({
          x: -viewport.x / viewport.zoom,
          y: -viewport.y / viewport.zoom,
          width: viewportSize.width / viewport.zoom,
          height: viewportSize.height / viewport.zoom,
        })
      : null,
  };
}
