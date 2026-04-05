import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  screenPointToWorldPoint,
  type GraphRect,
  type GraphViewport,
} from "./viewportTransform";

const MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH = 120;
const MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT = 24;

export function resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
  draggingSectionId,
  sceneSections,
  viewport,
  visibleViewportRect,
}: {
  draggingSectionId: string | null;
  sceneSections: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
}): Array<SettingsGraphSubstrateCanarySceneSection> {
  const visibleViewportWorldRect =
    resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
      viewport,
      visibleViewportRect,
    });
  return sceneSections.filter((section) =>
    shouldPresentSettingsGraphSubstrateCanarySectionShell({
      draggingSectionId,
      section,
      viewport,
      visibleViewportRect,
      visibleViewportWorldRect,
    }),
  );
}

export function resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
  viewport,
  visibleViewportRect,
}: {
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
}): GraphRect | null {
  if (viewport === null || viewport.zoom <= 0 || visibleViewportRect === null) {
    return null;
  }

  const topLeft = screenPointToWorldPoint(
    {
      x: visibleViewportRect.x,
      y: visibleViewportRect.y,
    },
    viewport,
  );
  const bottomRight = screenPointToWorldPoint(
    {
      x: visibleViewportRect.x + visibleViewportRect.width,
      y: visibleViewportRect.y + visibleViewportRect.height,
    },
    viewport,
  );
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);
  return {
    x,
    y,
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

export function shouldPresentSettingsGraphSubstrateCanarySectionShell({
  draggingSectionId,
  section,
  viewport,
  visibleViewportRect,
  visibleViewportWorldRect,
}: {
  draggingSectionId: string | null;
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
  visibleViewportWorldRect?: GraphRect | null;
}): boolean {
  const resolvedVisibleViewportWorldRect =
    visibleViewportWorldRect ??
    resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
      viewport,
      visibleViewportRect,
    });
  if (
    section.sectionId === draggingSectionId ||
    section.isActiveSection === true ||
    viewport === null ||
    viewport.zoom <= 0 ||
    resolvedVisibleViewportWorldRect === null
  ) {
    return true;
  }

  return (
    getVisibleSettingsGraphSubstrateCanarySectionWorldRect({
      section,
      visibleViewportWorldRect: resolvedVisibleViewportWorldRect,
    }) !== null
  );
}

export function shouldMountSettingsGraphSubstrateCanarySectionBody({
  draggingSectionId,
  section,
  viewport,
  visibleViewportRect,
  visibleViewportWorldRect,
}: {
  draggingSectionId: string | null;
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
  visibleViewportWorldRect?: GraphRect | null;
}): boolean {
  const resolvedVisibleViewportWorldRect =
    visibleViewportWorldRect ??
    resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
      viewport,
      visibleViewportRect,
    });
  if (
    section.sectionId === draggingSectionId ||
    section.isActiveSection === true ||
    viewport === null ||
    viewport.zoom <= 0 ||
    resolvedVisibleViewportWorldRect === null
  ) {
    return true;
  }

  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return true;
  }

  const visibleSectionWorldRect =
    getVisibleSettingsGraphSubstrateCanarySectionWorldRect({
      section,
      visibleViewportWorldRect: resolvedVisibleViewportWorldRect,
    });
  if (visibleSectionWorldRect === null) {
    return false;
  }

  return (
    visibleSectionWorldRect.width * viewport.zoom >=
      MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH &&
    visibleSectionWorldRect.height * viewport.zoom >=
      MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT
  );
}

export function areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
  left: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>,
  right: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function getVisibleSettingsGraphSubstrateCanarySectionWorldRect({
  section,
  visibleViewportWorldRect,
}: {
  section: SettingsGraphSubstrateCanarySceneSection;
  visibleViewportWorldRect: GraphRect;
}): GraphRect | null {
  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return visibleViewportWorldRect;
  }

  const sectionWorldRect = {
    x: section.renderedPosition.x,
    y: section.renderedPosition.y,
    width: sectionBoundsSize.width,
    height: sectionBoundsSize.height,
  };
  return getGraphRectIntersection(sectionWorldRect, visibleViewportWorldRect);
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
