import { measureSettingsGraphSubstrateCanaryMotionAttribution } from "./settingsGraphSubstrateCanaryInstrumentation";
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
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneVisibleViewportWorldRectResolve",
      () =>
        resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
          viewport,
          visibleViewportRect,
        }),
    );
  if (
    viewport === null ||
    viewport.zoom <= 0 ||
    visibleViewportWorldRect === null
  ) {
    return sceneSections.slice();
  }
  return measureSettingsGraphSubstrateCanaryMotionAttribution(
    "presentedSceneSectionVisibilityFilter",
    () => {
      const presentedSceneSections: Array<SettingsGraphSubstrateCanarySceneSection> =
        [];
      for (const section of sceneSections) {
        if (
          shouldAlwaysPresentSettingsGraphSubstrateCanarySection({
            draggingSectionId,
            section,
          }) ||
          isSettingsGraphSubstrateCanarySectionVisibleInWorldRect({
            section,
            visibleViewportWorldRect,
          })
        ) {
          presentedSceneSections.push(section);
        }
      }
      return presentedSceneSections;
    },
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
    shouldAlwaysPresentSettingsGraphSubstrateCanarySection({
      draggingSectionId,
      section,
    }) ||
    viewport === null ||
    viewport.zoom <= 0 ||
    resolvedVisibleViewportWorldRect === null
  ) {
    return true;
  }

  return isSettingsGraphSubstrateCanarySectionVisibleInWorldRect({
    section,
    visibleViewportWorldRect: resolvedVisibleViewportWorldRect,
  });
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
    shouldAlwaysPresentSettingsGraphSubstrateCanarySection({
      draggingSectionId,
      section,
    }) ||
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

export function resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds({
  draggingSectionId,
  presentedSceneSections,
  viewport,
  visibleViewportRect,
  visibleViewportWorldRect,
}: {
  draggingSectionId: string | null;
  presentedSceneSections: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
  visibleViewportWorldRect?: GraphRect | null;
}): Set<string> {
  const resolvedVisibleViewportWorldRect =
    visibleViewportWorldRect ??
    resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect({
      viewport,
      visibleViewportRect,
    });
  return new Set(
    presentedSceneSections
      .filter((section) =>
        shouldMountSettingsGraphSubstrateCanarySectionBody({
          draggingSectionId,
          section,
          viewport,
          visibleViewportRect,
          visibleViewportWorldRect: resolvedVisibleViewportWorldRect,
        }),
      )
      .map((section) => section.sectionId),
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

export function areSettingsGraphSubstrateCanarySectionIdSetsEqual(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const sectionId of left) {
    if (!right.has(sectionId)) {
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
  const sectionX = section.renderedPosition.x;
  const sectionY = section.renderedPosition.y;
  const viewportRightEdge =
    visibleViewportWorldRect.x + visibleViewportWorldRect.width;
  const viewportBottomEdge =
    visibleViewportWorldRect.y + visibleViewportWorldRect.height;
  const x = Math.max(sectionX, visibleViewportWorldRect.x);
  const y = Math.max(sectionY, visibleViewportWorldRect.y);
  const rightEdge = Math.min(
    sectionX + sectionBoundsSize.width,
    viewportRightEdge,
  );
  const bottomEdge = Math.min(
    sectionY + sectionBoundsSize.height,
    viewportBottomEdge,
  );
  const width = rightEdge - x;
  const height = bottomEdge - y;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function shouldAlwaysPresentSettingsGraphSubstrateCanarySection({
  draggingSectionId,
  section,
}: {
  draggingSectionId: string | null;
  section: SettingsGraphSubstrateCanarySceneSection;
}) {
  return (
    section.sectionId === draggingSectionId || section.isActiveSection === true
  );
}

function isSettingsGraphSubstrateCanarySectionVisibleInWorldRect({
  section,
  visibleViewportWorldRect,
}: {
  section: SettingsGraphSubstrateCanarySceneSection;
  visibleViewportWorldRect: GraphRect;
}) {
  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return true;
  }

  const viewportRightEdge =
    visibleViewportWorldRect.x + visibleViewportWorldRect.width;
  const viewportBottomEdge =
    visibleViewportWorldRect.y + visibleViewportWorldRect.height;
  const sectionRightEdge = section.renderedPosition.x + sectionBoundsSize.width;
  const sectionBottomEdge =
    section.renderedPosition.y + sectionBoundsSize.height;
  return (
    section.renderedPosition.x < viewportRightEdge &&
    sectionRightEdge > visibleViewportWorldRect.x &&
    section.renderedPosition.y < viewportBottomEdge &&
    sectionBottomEdge > visibleViewportWorldRect.y
  );
}
