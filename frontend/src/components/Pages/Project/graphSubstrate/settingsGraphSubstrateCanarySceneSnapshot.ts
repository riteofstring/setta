import type { SectionElementSize } from "state/definitions";
import { type GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  resolveSettingsGraphSubstrateCanarySectionGeometry,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySectionGeometry";
import type { GraphRect } from "./viewportTransform";

export type { SettingsGraphSubstrateCanarySectionPositionOverride };

export type SettingsGraphSubstrateCanarySceneSection =
  GraphSubstrateCanarySection & {
    renderedPosition: GraphSubstrateCanarySection["position"];
    sceneBoundsSize: SectionElementSize | null;
  };

export type SettingsGraphSubstrateCanarySceneSnapshot = {
  sceneBounds: GraphRect | null;
  sections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionsById: Map<string, SettingsGraphSubstrateCanarySceneSection>;
};

export function createEmptySettingsGraphSubstrateCanarySceneSnapshot(): SettingsGraphSubstrateCanarySceneSnapshot {
  return {
    sceneBounds: null,
    sections: [],
    sectionsById: new Map(),
  };
}

export function resolveSettingsGraphSubstrateCanarySceneSnapshot(
  sections: Array<GraphSubstrateCanarySection>,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
  draggingSectionId: string | null = null,
): SettingsGraphSubstrateCanarySceneSnapshot {
  const sceneSections = sections.map((section) => {
    const geometry = resolveSettingsGraphSubstrateCanarySectionGeometry(
      section,
      sectionPositionOverride,
    );
    const sceneSection: SettingsGraphSubstrateCanarySceneSection = {
      ...section,
      renderedPosition: geometry.renderedPosition,
      sceneBoundsSize: geometry.sceneBoundsSize,
      tempZIndex: getRenderedSectionTempZIndex(section, draggingSectionId),
    };
    return sceneSection;
  });

  return {
    sceneBounds:
      getSettingsGraphSubstrateCanarySceneBoundsForSections(sceneSections),
    sections: sceneSections,
    sectionsById: new Map(
      sceneSections.map((section) => [section.sectionId, section]),
    ),
  };
}

export function areSettingsGraphSubstrateCanarySceneSnapshotsEqual(
  left: SettingsGraphSubstrateCanarySceneSnapshot,
  right: SettingsGraphSubstrateCanarySceneSnapshot,
) {
  if (left === right) {
    return true;
  }

  if (
    !areGraphRectsEqual(left.sceneBounds, right.sceneBounds) ||
    left.sections.length !== right.sections.length
  ) {
    return false;
  }

  for (let index = 0; index < left.sections.length; index += 1) {
    const leftSection = left.sections[index];
    const rightSection = right.sections[index];
    if (!leftSection || !rightSection) {
      return false;
    }
    if (!areSceneSectionsEqual(leftSection, rightSection)) {
      return false;
    }
  }

  return true;
}

function getRenderedSectionTempZIndex(
  section: GraphSubstrateCanarySection,
  draggingSectionId: string | null,
) {
  if (draggingSectionId === section.sectionId) {
    return section.zIndex + 1000;
  }
  return section.tempZIndex;
}

export function getSettingsGraphSubstrateCanarySceneBoundsForSections(
  sections: Array<SettingsGraphSubstrateCanarySceneSection>,
): GraphRect | null {
  if (sections.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasAuthoritativeSectionBounds = false;

  for (const section of sections) {
    const boundsSize = section.sceneBoundsSize;
    if (!boundsSize) {
      continue;
    }
    hasAuthoritativeSectionBounds = true;

    minX = Math.min(minX, section.renderedPosition.x);
    minY = Math.min(minY, section.renderedPosition.y);
    maxX = Math.max(maxX, section.renderedPosition.x + boundsSize.width);
    maxY = Math.max(maxY, section.renderedPosition.y + boundsSize.height);
  }

  if (!hasAuthoritativeSectionBounds) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function areSceneSectionsEqual(
  left: SettingsGraphSubstrateCanarySceneSection,
  right: SettingsGraphSubstrateCanarySceneSection,
) {
  return (
    left.sectionId === right.sectionId &&
    left.zIndex === right.zIndex &&
    left.tempZIndex === right.tempZIndex &&
    left.width === right.width &&
    left.height === right.height &&
    left.isActiveSection === right.isActiveSection &&
    left.isInOtherProjectConfigs === right.isInOtherProjectConfigs &&
    left.positionAndSizeLocked === right.positionAndSizeLocked &&
    left.sectionTypeName === right.sectionTypeName &&
    left.styleColor === right.styleColor &&
    left.textBlockMetaControlStyle === right.textBlockMetaControlStyle &&
    left.sizeAuthority === right.sizeAuthority &&
    arePositionsEqual(left.position, right.position) &&
    arePositionsEqual(left.renderedPosition, right.renderedPosition) &&
    areSectionElementSizesEqual(left.sceneBoundsSize, right.sceneBoundsSize)
  );
}

function areGraphRectsEqual(left: GraphRect | null, right: GraphRect | null) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function arePositionsEqual(
  left: GraphSubstrateCanarySection["position"],
  right: GraphSubstrateCanarySection["position"],
) {
  return left.x === right.x && left.y === right.y;
}

function areSectionElementSizesEqual(
  left: SectionElementSize | null,
  right: SectionElementSize | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.width === right.width && left.height === right.height;
}
