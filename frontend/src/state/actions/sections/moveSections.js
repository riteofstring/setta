import C from "constants/constants.json";
import { BehaviorDropType } from "forks/dnd-kit/dropTypes";
import { addNodes, deleteNodes } from "state/actions/nodeInternals";
import { setSectionChildrenAndNames } from "state/actions/sections/setters";
import { setSectionUITypeConfig } from "state/actions/uiTypes/setSectionUITypeConfig";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { PANEID } from "utils/constants";
import { isRoot, rootTypeToChildSubType } from "utils/sectionTypeHelpers";
import { insertIntoArray } from "utils/utils";
import { getSectionType } from "../../getters/sectionInfo";
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

  maybeChangeSectionSubtype({
    newParentId,
    sectionId,
  });

  setChildrenAndParent({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
    position,
  });

  setSectionSize({ newParentId, sectionId });

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

function maybeChangeSectionSubtype({ newParentId, sectionId }) {
  const newParentUIType =
    newParentId === PANEID ? null : getSectionType(newParentId);

  let configProps;
  if (newParentUIType && isRoot(newParentUIType.type)) {
    configProps = {
      configName: "subType",
      newValueFn: () => rootTypeToChildSubType[newParentUIType.type],
    };
  } else {
    configProps = {
      configName: "subType",
      newValueFn: () => null,
    };
  }

  setSectionUITypeConfig({ sectionId, configProps });
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
