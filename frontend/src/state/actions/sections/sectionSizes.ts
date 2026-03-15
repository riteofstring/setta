import _ from "lodash";
import { setCurrEffectiveSectionImplValue } from "state/actions/sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionEffectiveImpls";
import {
  getHighestAncestor,
  getSectionDescendants,
} from "state/actions/sectionHierarchy";
import { getEmbeddedAttachedTerminalParentIdForTerminalSection } from "state/actions/sectionLayoutQueries";
import { ZustandProjectState } from "state/definitions";
import {
  createSectionSize,
  SectionSize,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function setSelfParentSiblingChildrenWidths(
  sectionId: string,
  changedSize: Partial<SectionSize>,
  state: ZustandProjectState,
) {
  const newSize = setSectionSize(sectionId, changedSize, state);
  let updatedSectionSizes: Record<string, SectionSize> = {
    [sectionId]: newSize,
  };
  if (!_.isNil(changedSize.width)) {
    const embeddedTerminalParentId =
      getEmbeddedAttachedTerminalParentIdForTerminalSection(state, sectionId);
    if (embeddedTerminalParentId !== null) {
      updatedSectionSizes[embeddedTerminalParentId] = setSectionSize(
        embeddedTerminalParentId,
        { width: changedSize.width },
        state,
      );
      updatedSectionSizes = {
        ...updatedSectionSizes,
        ...setAllOtherWidths(
          embeddedTerminalParentId,
          changedSize.width,
          state,
        ),
      };
      return updatedSectionSizes;
    }
    updatedSectionSizes = {
      ...updatedSectionSizes,
      ...setAllOtherWidths(sectionId, changedSize.width, state),
    };
  }
  return updatedSectionSizes;
}

function setAllOtherWidths(
  sectionId: string,
  width: SectionSize["width"],
  state: ZustandProjectState,
) {
  // We want to stop width propagation as soon as we hit a horizontal group.
  const parentIdGetter = (id: string) => {
    const impl = getCurrEffectiveSectionImpl(state, id);
    if (
      impl.parentId &&
      impl.type === SectionTypeEnum.Group &&
      !impl.isHorizontalOrientation
    ) {
      return impl.parentId;
    }
    return null;
  };
  const highestAncestor = getHighestAncestor(sectionId, parentIdGetter);
  const updatedSectionSizes = setAllChildrenWidths({
    sectionId: highestAncestor,
    exclude: sectionId,
    width,
    state,
  });
  return updatedSectionSizes;
}

function setAllChildrenWidths({ sectionId, exclude, width, state }) {
  const sectionIds = getSectionDescendants(sectionId, state);
  const updatedSectionSizes: Record<string, SectionSize> = {};
  for (const s of sectionIds) {
    if (s === exclude) {
      continue;
    }
    const newSize = setSectionSize(s, { width }, state);
    updatedSectionSizes[s] = newSize;
  }
  return updatedSectionSizes;
}

export function adjustSizeToBeAtLeastMin(height, width, minHeight, minWidth) {
  const aspectRatio = width / height;

  if (height < minHeight || width < minWidth) {
    if (height < minHeight) {
      height = minHeight;
      width = height * aspectRatio;
    }

    if (width < minWidth) {
      width = minWidth;
      height = width / aspectRatio;
    }

    // Round the dimensions to avoid floating-point issues
    return {
      height: Math.round(height),
      width: Math.round(width),
    };
  }

  // If no adjustment is needed, return the original dimensions
  return { height, width };
}

export function adjustAspectRatio(height, width, imgHeight, imgWidth) {
  // If both height and width are "auto", return original image dimensions
  if (height === "auto" && width === "auto") {
    return { height: imgHeight, width: imgWidth };
  }

  // Calculate the aspect ratio of the original image
  const imgAspectRatio = imgWidth / imgHeight;

  // If height is "auto", adjust height based on width
  if (height === "auto") {
    const newHeight = width / imgAspectRatio;
    return { height: newHeight, width: width };
  }

  // If width is "auto", adjust width based on height
  if (width === "auto") {
    const newWidth = height * imgAspectRatio;
    return { height: height, width: newWidth };
  }

  // Calculate the current aspect ratio
  const currentAspectRatio = width / height;

  // Adjust dimensions to maintain the original aspect ratio
  if (currentAspectRatio > imgAspectRatio) {
    // Adjust width based on height
    const newWidth = height * imgAspectRatio;
    return { height: height, width: newWidth };
  } else if (currentAspectRatio < imgAspectRatio) {
    // Adjust height based on width
    const newHeight = width / imgAspectRatio;
    return { height: newHeight, width: width };
  } else {
    // Aspect ratios match, return the provided dimensions
    return { height: height, width: width };
  }
}

export type ResizeHandleDirection =
  | "bottom"
  | "bottomLeft"
  | "bottomRight"
  | "left"
  | "right"
  | "top"
  | "topLeft"
  | "topRight";

const RESIZE_WIDTH_DIRECTIONS = new Set<ResizeHandleDirection>([
  "right",
  "bottomRight",
  "topRight",
]);
const RESIZE_HEIGHT_DIRECTIONS = new Set<ResizeHandleDirection>([
  "bottom",
  "bottomRight",
  "bottomLeft",
]);

export function isHeightResizeDirection(
  direction: ResizeHandleDirection,
): boolean {
  return RESIZE_HEIGHT_DIRECTIONS.has(direction);
}

export function getResizeStartAutoSizeUpdate({
  size,
  direction,
  rect,
}: {
  size: SectionSize;
  direction: ResizeHandleDirection;
  rect: { width: number; height: number };
}): Partial<SectionSize> | null {
  const nextSize: Partial<SectionSize> = {};
  if (size.width === "auto" && RESIZE_WIDTH_DIRECTIONS.has(direction)) {
    nextSize.width = Math.round(rect.width);
  }
  if (size.height === "auto" && RESIZE_HEIGHT_DIRECTIONS.has(direction)) {
    nextSize.height = Math.round(rect.height);
  }
  return Object.keys(nextSize).length > 0 ? nextSize : null;
}

export function setSectionSize(
  sectionId: string,
  size: Partial<SectionSize>,
  state: ZustandProjectState,
) {
  let newSize!: SectionSize;
  setCurrEffectiveSectionImplValue(state, sectionId, {
    size: (currSize) => {
      newSize = createSectionSize({
        ...currSize,
        ...size,
      });
      return newSize;
    },
  });
  return newSize;
}
