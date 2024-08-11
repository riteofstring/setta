import C from "constants/constants.json";
import { BehaviorDropType } from "forks/dnd-kit/dropTypes";
import { addNodes, deleteNodes } from "state/actions/nodeInternals";
import { setSectionChildrenAndNames } from "state/actions/sections/setters";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import { PANEID } from "utils/constants";
import { newCodeInfo } from "utils/objs/codeInfo";
import { insertIntoArray } from "utils/utils";
import { getSectionInfo, getSectionType } from "../../getters/sectionInfo";
import { addCodeInfo } from "../codeInfo";
import { getSectionVariantIdAndMappedDBSource } from "../sectionVariants";
import { createSectionInfo } from "./createSections";
import { setAllChildrenWidths } from "./sectionSizes";
import { setSectionParentId } from "./setters";

export function moveSections({
  sectionIds,
  oldParentIds,
  newParentIds,
  positions,
  oldParentId,
  newParentId,
}) {
  for (const [idx, sectionId] of sectionIds.entries()) {
    moveSection({
      oldParentId: oldParentIds ? oldParentIds[sectionId] : oldParentId,
      newParentId: newParentIds ? newParentIds[sectionId] : newParentId,
      sectionId,
      newIndex: idx,
      position: positions ? positions[sectionId] : null,
      behaviorDropType: null,
    });
  }
}

export function moveSection({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
  position,
  behaviorDropType,
  incrementVersion = false,
}) {
  if (!newParentId || behaviorDropType === BehaviorDropType.INVALID) {
    return;
  }

  setChildrenAndParent({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
    position,
  });

  setSectionSize({ newParentId, sectionId });

  maybeCreateReferenceSections({ sectionId, oldParentId });

  maybeIncrementProjectStateVersion(incrementVersion);
}

function setChildrenAndParent({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
  position,
}) {
  // Remove child from old parent's list
  if (oldParentId === PANEID) {
    // This means it was a top level section
    deleteNodes([sectionId]);
  } else {
    setSectionChildrenAndNames(oldParentId, (x) =>
      x.filter((y) => y !== sectionId),
    );
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    addNodes([{ id: sectionId, position, zIndex: 0, tempZIndex: 0 }]);
  } else {
    // Add child to new parent's list
    setSectionChildrenAndNames(newParentId, (x) =>
      insertIntoArray(x, newIndex, sectionId),
    );
  }

  setSectionParentId(sectionId, newParentId === PANEID ? null : newParentId);
}

function setSectionSize({ newParentId, sectionId }) {
  if (newParentId === PANEID) {
    return;
  }
  const s = useSectionInfos.getState();
  const isDeck = getSectionType(newParentId).type === C.DECK;

  // if new parent is a deck and the deck has children
  if (isDeck) {
    const deckChildren = s.x[newParentId].children;
    if (deckChildren.length > 0) {
      const width = s.x[deckChildren[0]].size.width;
      setAllChildrenWidths({ sectionId, width });
    }
  } else {
    const width = s.x[newParentId].size.width;
    setAllChildrenWidths({ sectionId, width });
  }
}

function maybeCreateReferenceSections({ sectionId, oldParentId }) {
  if (oldParentId === PANEID) {
    return;
  }

  const { variantIds } = getSectionInfo(oldParentId);
  if (variantIds.length <= 1) {
    return;
  }

  // If the old parent has multiple variants,
  // then we need to check if any of those variants
  // have children that include sectionId.
  // If they do include sectionId, those instances
  // need to be replaced with a reference, to prevent
  // the possibility of sectionId appearing in 2 places at once.
  const { variantId: activeVariantId, dbSource } =
    getSectionVariantIdAndMappedDBSource(oldParentId);
  const variantState = useSectionVariants.getState().x;
  for (const variantId of variantIds) {
    if (variantId === activeVariantId) {
      continue;
    }
    const children = variantState[dbSource][variantId].children;
    const sectionIdx = children.findIndex((x) => x === sectionId);
    if (sectionIdx !== -1) {
      const info = newCodeInfo({
        name: getSectionInfo(sectionId).name,
        editable: false,
        rcType: C.CALLABLE,
      });
      const { codeInfoId } = getSectionInfo(sectionId);
      addCodeInfo({ info, parent: codeInfoId });

      const [newId] = createSectionInfo({
        sectionProps: {
          parentId: oldParentId,
          selectedItem: info.id,
          hideParams: true,
        },
      });

      useSectionVariants.setState((state) => {
        state.x[dbSource][variantId].children = state.x[dbSource][
          variantId
        ].children.toSpliced(sectionIdx, 1, newId);
      });
    }
  }
}
