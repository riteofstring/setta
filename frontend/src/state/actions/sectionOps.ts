import C from "constants/constants.json";
import { dbDeleteTerminals } from "requests/terminals";
import { setSectionUITypeConfig } from "state/actions/setSectionUITypeConfig";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { addNodes, deleteNodes } from "state/definitions/nodeInternals";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { PANEID } from "utils/constants";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { insertIntoArray } from "utils/utils";
import { isRoot, rootTypeToChildSubType } from "z_utils/constants";
import {
  SectionUITypeConfigType,
  UITypeSetOneConfigPayloadType,
} from "z_utils/types/uiType";
import { getSectionType } from "../getters/sectionInfo";
import { removeActiveSectionIds } from "./activeSection";
import { setAllChildren } from "./children";
import { setAllChildrenWidths } from "./sectionSizes";
import { setSectionParentId } from "./setters";

export function deleteSections({ sectionIds, incrementVersion = false }) {
  const idsToDelete: string[] = [];
  for (const sid of sectionIds) {
    idsToDelete.push(...getIdsToDelete(sid));
  }

  removeActiveSectionIds(idsToDelete);
  useSectionInfos.getState().removeSectionInfos(idsToDelete);
  deleteNodes(idsToDelete);
  dbDeleteTerminals(idsToDelete); // delete any terminals associated with the sections

  maybeIncrementProjectStateVersion(incrementVersion);
}

function getIdsToDelete(sectionId) {
  const sectionInfosState = useSectionInfos.getState();
  const idsToDelete = [sectionId];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const { children: idxChildren, paramSweepSectionId } =
      sectionInfosState.x[idsToDelete[idx]];
    if (idxChildren) {
      idsToDelete.push(...idxChildren);
    }
    if (paramSweepSectionId) {
      idsToDelete.push(paramSweepSectionId);
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
    deleteNodes([sectionId]);
  } else {
    setAllChildren(oldParentId, (x) => x.filter((y) => y !== sectionId));
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    addNodes([{ id: sectionId, position, zIndex: 0, tempZIndex: 0 }]);
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
