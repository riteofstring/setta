import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionUITypeConfig } from "thunks/uiTypes/setSectionUITypeConfig";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID, REACT_FLOW_STORE } from "utils/constants";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { insertIntoArray } from "utils/utils";
import { DECK, isRoot, rootTypeToChildSubType } from "z_utils/constants";
import {
  SectionUITypeConfigType,
  UITypeSetOneConfigPayloadType,
} from "z_utils/types/uiType";
import { setAllChildren } from "./children";
import { getSectionType } from "./getters";
import { setAllChildrenWidths } from "./sectionSizes";
import { setSectionParentId } from "./setters";

export function deleteSections({ sectionIds, incrementVersion = false }) {
  const idsToDelete: string[] = [];
  for (const sid of sectionIds) {
    idsToDelete.push(...getIdsToDelete(sid));
  }

  useActiveSection.getState().removeIds(idsToDelete);
  useSectionInfos.getState().removeSectionInfos(idsToDelete);
  REACT_FLOW_STORE.rf.deleteNodes(idsToDelete);

  maybeIncrementProjectStateVersion(incrementVersion);
}

function getIdsToDelete(sectionId) {
  const sectionInfosState = useSectionInfos.getState();
  const idsToDelete = [sectionId];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const idxChildren = sectionInfosState.x[idsToDelete[idx]].children;
    if (idxChildren) {
      idsToDelete.push(...idxChildren);
    }
    idx += 1;
  }
  return idsToDelete;
}

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
    REACT_FLOW_STORE.rf.deleteNodes([sectionId]);
  } else {
    setAllChildren(oldParentId, (x) => x.filter((y) => y !== sectionId));
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    REACT_FLOW_STORE.rf.addNodes([
      { id: sectionId, position, zIndex: 0, tempZIndex: 0 },
    ]);
  } else {
    // Add child to new parent's list
    setAllChildren(newParentId, (x) => insertIntoArray(x, newIndex, sectionId));
  }

  setSectionParentId(sectionId, newParentId === PANEID ? null : newParentId);
}

function maybeChangeSectionSubtype({ newParentId, sectionId }) {
  const newParentUIType =
    newParentId === PANEID ? null : getSectionType(newParentId);

  let configProps: Partial<
    UITypeSetOneConfigPayloadType<SectionUITypeConfigType["subType"]>
  >;
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
  const isDeck = getSectionType(newParentId).type === DECK;

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
