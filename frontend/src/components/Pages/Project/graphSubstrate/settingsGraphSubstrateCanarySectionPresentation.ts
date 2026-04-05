import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  worldPointToScreenPoint,
  type GraphRect,
  type GraphViewport,
} from "./viewportTransform";

const MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH = 120;
const MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT = 24;

export function shouldPresentSettingsGraphSubstrateCanarySectionShell({
  draggingSectionId,
  section,
  viewport,
  visibleViewportRect,
}: {
  draggingSectionId: string | null;
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
}): boolean {
  if (
    section.sectionId === draggingSectionId ||
    section.isActiveSection === true ||
    viewport === null ||
    viewport.zoom <= 0 ||
    visibleViewportRect === null
  ) {
    return true;
  }

  return (
    getVisibleSettingsGraphSubstrateCanarySectionScreenRect({
      section,
      viewport,
      visibleViewportRect,
    }) !== null
  );
}

export function shouldMountSettingsGraphSubstrateCanarySectionBody({
  draggingSectionId,
  section,
  viewport,
  visibleViewportRect,
}: {
  draggingSectionId: string | null;
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
}): boolean {
  if (
    section.sectionId === draggingSectionId ||
    section.isActiveSection === true ||
    viewport === null ||
    viewport.zoom <= 0 ||
    visibleViewportRect === null
  ) {
    return true;
  }

  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return true;
  }

  const visibleSectionScreenRect =
    getVisibleSettingsGraphSubstrateCanarySectionScreenRect({
      section,
      viewport,
      visibleViewportRect,
    });
  if (visibleSectionScreenRect === null) {
    return false;
  }

  return (
    visibleSectionScreenRect.width >= MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH &&
    visibleSectionScreenRect.height >= MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT
  );
}

function getVisibleSettingsGraphSubstrateCanarySectionScreenRect({
  section,
  viewport,
  visibleViewportRect,
}: {
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport;
  visibleViewportRect: GraphRect;
}): GraphRect | null {
  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return visibleViewportRect;
  }

  const sectionScreenPosition = worldPointToScreenPoint(
    section.renderedPosition,
    viewport,
  );
  const sectionScreenRect = {
    x: sectionScreenPosition.x,
    y: sectionScreenPosition.y,
    width: sectionBoundsSize.width * viewport.zoom,
    height: sectionBoundsSize.height * viewport.zoom,
  };
  return getGraphRectIntersection(sectionScreenRect, visibleViewportRect);
}

function getGraphRectIntersection(
  left: GraphRect,
  right: GraphRect,
): GraphRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const width = rightEdge - x;
  const height = bottomEdge - y;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}
