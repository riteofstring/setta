import C from "constants/constants.json";
import { BehaviorDropType } from "forks/dnd-kit/dropTypes";
import { dbCreateCopyOfSections } from "requests/pasteSections";
import { addNodes, deleteNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos, useSectionVariants } from "state/definitions";
import { PANEID } from "utils/constants";
import { insertIntoArray } from "utils/utils";
import { getSectionInfo, getSectionType } from "../../getters/sectionInfo";
import { copySections } from "../copyPaste/copy";
import { updateKeywordRegex } from "../keywordRegex";
import {
  getSectionChildren,
  setSectionVariantChildren,
} from "../sectionVariants";
import { updateStateWithSectionCopy } from "./loadSections";
import { setAllChildrenWidths } from "./sectionSizes";
import { setSectionParentId } from "./setters";

export async function moveSections({
  sectionIds,
  oldParentIds,
  newParentIds,
  positions,
  oldParentId,
  newParentId,
}) {
  for (const [idx, sectionId] of sectionIds.entries()) {
    await moveSection({
      oldParentId: oldParentIds ? oldParentIds[sectionId] : oldParentId,
      newParentId: newParentIds ? newParentIds[sectionId] : newParentId,
      sectionId,
      newIndex: idx,
      position: positions ? positions[sectionId] : null,
      behaviorDropType: null,
    });
  }
}

export async function moveSection({
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

  const newSectionId = await maybeMakeCopyOfSection({
    sectionId,
    oldParentId,
    newParentId,
  });

  setChildrenAndParent({
    oldParentId,
    newParentId,
    oldSectionId: sectionId,
    newSectionId,
    newIndex,
    position,
  });

  setSectionSize({ newParentId, sectionId: newSectionId });

  // TODO: make this optional via input argument so that it doesn't get called unnecessarily
  updateKeywordRegex();

  // maybeCreateReferenceSections({ sectionId, oldParentId });

  maybeIncrementProjectStateVersion(incrementVersion);
}

function setChildrenAndParent({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
}) {
  // Remove child from old parent's list
  if (oldParentId === PANEID) {
    // This means it was a top level section
    deleteNodes([oldSectionId]);
  } else {
    setSectionVariantChildren({
      sectionId: oldParentId,
      newStateFn: (x) => x.filter((y) => y !== oldSectionId),
    });
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    addNodes([{ id: newSectionId, position, zIndex: 0, tempZIndex: 0 }]);
  } else {
    // Add child to new parent's list
    setSectionVariantChildren({
      sectionId: newParentId,
      newStateFn: (x) => insertIntoArray(x, newIndex, newSectionId),
    });
  }

  setSectionParentId(newSectionId, newParentId === PANEID ? null : newParentId);
}

function setSectionSize({ newParentId, sectionId }) {
  if (newParentId === PANEID) {
    return;
  }
  const s = useSectionInfos.getState();
  const isDeck = getSectionType(newParentId).type === C.DECK;

  // if new parent is a deck and the deck has children and is not horizontal
  if (isDeck) {
    const { isHorizontalOrientation } = getSectionInfo(newParentId);
    if (!isHorizontalOrientation) {
      const deckChildren = getSectionChildren(newParentId);
      if (deckChildren.length > 0) {
        const width = s.x[deckChildren[0]].size.width;
        setAllChildrenWidths({ sectionId, width });
      }
    }
  } else {
    const width = s.x[newParentId].size.width;
    setAllChildrenWidths({ sectionId, width });
  }
}

async function maybeMakeCopyOfSection({ sectionId, oldParentId, newParentId }) {
  if (oldParentId === PANEID || oldParentId === newParentId) {
    return sectionId;
  }

  const { variantIds } = getSectionInfo(oldParentId);
  if (variantIds.length <= 1) {
    return sectionId;
  }

  // If the old parent has multiple variants,
  // then we need to check if any of those variants
  // have children that include sectionId.
  // If they do include sectionId, then make a copy of sectionId
  // to prevent the possibility of sectionId appearing in 2 places at once.
  const { variantId: activeVariantId } = getSectionInfo(sectionId);
  const variantState = useSectionVariants.getState().x;
  let isInOtherVariants = false;
  for (const variantId of variantIds) {
    if (variantId === activeVariantId) {
      continue;
    }
    const children = variantState[variantId].children;
    const sectionIdx = children.findIndex((x) => x === sectionId);
    if (sectionIdx !== -1) {
      isInOtherVariants = true;
      break;
    }
  }

  if (isInOtherVariants) {
    const res = await dbCreateCopyOfSections(copySections([sectionId]));
    if (res.status === 200) {
      console.log("data", res.data);
      updateStateWithSectionCopy({ ...res.data });
      return Object.keys(res.data.sections)[0];
    }
  }

  return sectionId;
}

// function maybeCreateReferenceSections({ sectionId, oldParentId }) {
//   if (oldParentId === PANEID) {
//     return;
//   }

//   const { variantIds } = getSectionInfo(oldParentId);
//   if (variantIds.length <= 1) {
//     return;
//   }

//   // If the old parent has multiple variants,
//   // then we need to check if any of those variants
//   // have children that include sectionId.
//   // If they do include sectionId, those instances
//   // need to be replaced with a reference, to prevent
//   // the possibility of sectionId appearing in 2 places at once.
//   const { variantId: activeVariantId, dbSource } =
//     getSectionVariantId(oldParentId);
//   const variantState = useSectionVariants.getState().x;
//   const infoToFullName = computeInfoToFullName();
//   for (const variantId of variantIds) {
//     if (variantId === activeVariantId) {
//       continue;
//     }
//     const children = variantState[dbSource][variantId].children;
//     const sectionIdx = children.findIndex((x) => x === sectionId);
//     if (sectionIdx !== -1) {
//       const [newId] = createSectionInfo({
//         sectionProps: {
//           parentId: oldParentId,
//           uiTypeId: BASE_UI_TYPE_IDS[C.REFERENCE_SECTION],
//         },
//       });

//       const info = newCodeInfo({
//         name: infoToFullName[keyForInfoToFullName({ sectionId })],
//         editable: false,
//         rcType: C.CALLABLE,
//       });
//       const { codeInfoId } = getSectionInfo(newId);
//       addCodeInfo({ info, parent: codeInfoId });
//       setSelectedItem(newId, info.name);

//       useSectionVariants.setState((state) => {
//         state.x[dbSource][variantId].children = state.x[dbSource][
//           variantId
//         ].children.toSpliced(sectionIdx, 1, newId);
//       });
//     }
//   }
// }
