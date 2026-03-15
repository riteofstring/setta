import _ from "lodash";
import { setCurrEffectiveSectionImplValue } from "state/actions/sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionEffectiveImplSelectors";
import {
  getHighestAncestor,
  getSectionDescendants,
} from "state/actions/sectionHierarchy";
import { getEmbeddedAttachedTerminalParentIdForTerminalSection } from "state/actions/sectionTerminalAttachmentQueries";
import { type ZustandProjectState } from "state/definitions";
import {
  createSectionSize,
  type SectionSize,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function setSelfParentSiblingChildrenWidths(
  sectionId: string,
  changedSize: Partial<SectionSize>,
  state: ZustandProjectState,
): Record<string, SectionSize> {
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
): Record<string, SectionSize> {
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
  return setAllChildrenWidths({
    sectionId: highestAncestor,
    exclude: sectionId,
    width,
    state,
  });
}

function setAllChildrenWidths({
  sectionId,
  exclude,
  width,
  state,
}: {
  sectionId: string;
  exclude: string;
  width: SectionSize["width"];
  state: ZustandProjectState;
}): Record<string, SectionSize> {
  const sectionIds = getSectionDescendants(sectionId, state);
  const updatedSectionSizes: Record<string, SectionSize> = {};
  for (const descendantId of sectionIds) {
    if (descendantId === exclude) {
      continue;
    }
    updatedSectionSizes[descendantId] = setSectionSize(
      descendantId,
      { width },
      state,
    );
  }
  return updatedSectionSizes;
}

export function setSectionSize(
  sectionId: string,
  size: Partial<SectionSize>,
  state: ZustandProjectState,
): SectionSize {
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
