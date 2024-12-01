import _ from "lodash";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { getSectionInfo, getSectionParentId } from "../../getters/sectionInfo";
import {
  getAllSectionChildrenIds,
  getHighestAncestor,
} from "./sectionChildren";
import { setSectionInfoAttr } from "./sectionInfos";

export function setSelfParentSiblingChildrenWidths({ sectionId, changedSize }) {
  // set own width
  setSectionSize(sectionId, changedSize);

  if (!_.isNil(changedSize.width)) {
    setAllOtherWidths({
      sectionId,
      width: changedSize.width,
    });
  }

  maybeIncrementProjectStateVersion(true);
}

function setAllOtherWidths({ sectionId, width }) {
  // We want to stop width propagation as soon as we hit a horizontal group.
  const parentIdGetter = (id) => {
    const parentId = getSectionParentId(id);
    if (parentId && !getSectionInfo(parentId).isHorizontalOrientation) {
      return parentId;
    }
    return null;
  };
  const highestAncestor = getHighestAncestor(sectionId, parentIdGetter);
  setAllChildrenWidths({
    sectionId: highestAncestor,
    exclude: sectionId,
    width,
  });
}

export function setAllChildrenWidths({ sectionId, exclude, width }) {
  const sectionIds = getAllSectionChildrenIds(
    useSectionInfos.getState().x,
    useSectionInfos.getState().variants,
    [sectionId],
  );
  setSectionInfoAttr({
    sectionIds: sectionIds.filter((x) => x !== exclude),
    attr: "size",
    newValueFn: (size) => ({ width, height: size.height }),
  });
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

export function setSectionSize(sectionId, size) {
  useSectionInfos.setState((x) => {
    _setSectionSize(sectionId, size, x);
  });
}

export function _setSectionSize(sectionId, size, x) {
  x.x[sectionId].size = { ...x.x[sectionId].size, ...size };
}
