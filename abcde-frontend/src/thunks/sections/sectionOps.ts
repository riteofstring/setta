import {
  DECK,
  isRoot,
  REF_UI_TYPE_ID,
  rootTypeToChildSubType,
} from "abcde-utils/src/constants";
import {
  SectionUITypeConfigType,
  UITypeSetOneConfigPayloadType,
} from "abcde-utils/src/types/uiType";
import { useActiveSection } from "models/activeSection";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { addKwarg } from "thunks/kwargs";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID } from "utils/constants";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { insertIntoArray } from "utils/utils";
import {
  getParamChildId,
  setParamChildId,
  setParamEnteredValue,
} from "../paramInfos";
import { setParamUITypeId, setSectionUITypeConfig } from "../uiTypes";
import { getParamWithSameName } from "./sectionContents";
import {
  getSectionConfig,
  getSectionName,
  getSectionType,
  setAllChildren,
  setSectionParamInfoId,
  setSectionParentId,
} from "./sections";
import { setAllChildrenWidths } from "./sectionSizes";

export function deleteSections({ sectionIds, incrementVersion = false }) {
  const idsToDelete: string[] = [];
  for (const sid of sectionIds) {
    idsToDelete.push(...getIdsToDelete(sid));
  }

  const activeSectionState = useActiveSection.getState();
  const activeSection = activeSectionState.id;
  if (activeSection && idsToDelete.includes(activeSection)) {
    activeSectionState.setId(null);
  }
  useSectionInfos.getState().removeSectionInfos(idsToDelete);
  useProjectConfig.getState().deleteChildren(idsToDelete);

  maybeIncrementProjectStateVersion(incrementVersion);
}

function getIdsToDelete(sectionId) {
  const sectionInfosState = useSectionInfos.getState();
  const allChildren = sectionInfosState.allChildren;
  const idsToDelete = [sectionId];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const currChildren = allChildren[idsToDelete[idx]];
    if (currChildren) {
      idsToDelete.push(...currChildren);
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
}) {
  if (!newParentId || behaviorDropType === BehaviorDropType.INVALID) {
    return;
  }

  unlinkParamFromSection({ parentId: oldParentId, sectionId });

  maybeChangeSectionSubtype({
    newParentId,
    sectionId,
  });

  setChildrenAndParent({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
  });

  maybeChangeNewParamUIType({ newParentId, sectionId, behaviorDropType });

  maybeSetInitialPosition({ newParentId, sectionId, position });

  setSectionSize({ newParentId, sectionId });
}

function setChildrenAndParent({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
}) {
  const p = useProjectConfig.getState();
  // Remove child from old parent's list
  if (oldParentId === PANEID) {
    // This means it was a top level section
    p.deleteChildren([sectionId]);
  } else {
    setAllChildren(oldParentId, (x) => x.filter((y) => y !== sectionId));
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    p.addChildren([sectionId]);
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
    const deckChildren = s.currChildren[newParentId];
    if (deckChildren.length > 0) {
      const width = s.x[deckChildren[0]].size.width;
      setAllChildrenWidths({ sectionId, width });
    }
  } else {
    const width = s.x[newParentId].size.width;
    setAllChildrenWidths({ sectionId, width });
  }
}

function maybeSetInitialPosition({ newParentId, sectionId, position }) {
  if (newParentId === PANEID && position) {
    useSectionInfos.getState().setSectionInfoAttr({
      sectionId,
      attr: "initialPosition",
      value: position,
    });
  }
}

function maybeChangeNewParamUIType({
  newParentId,
  sectionId,
  behaviorDropType,
}) {
  if (
    newParentId === PANEID ||
    behaviorDropType === BehaviorDropType.DROP_HERE ||
    behaviorDropType === BehaviorDropType.NEW_LIST_ELEMENT
  ) {
    return;
  }

  let paramIdToLinkTo;

  if (behaviorDropType === BehaviorDropType.NEW_ARG) {
    const sectionName = getSectionName(sectionId);
    const { selectedItem } = getSectionConfig(newParentId);
    paramIdToLinkTo = addKwarg({
      sectionId: newParentId,
      objInfoId: selectedItem,
      name: sectionName,
    });
  } else if (behaviorDropType === BehaviorDropType.EXISTING_ARG) {
    paramIdToLinkTo = getParamWithSameName(sectionId, newParentId);
    paramIdToLinkTo = paramIdToLinkTo.id;
  }

  if (paramIdToLinkTo) {
    linkParamToSection({
      parentId: newParentId,
      paramInfoId: paramIdToLinkTo,
      sectionId,
    });
  }
}

function linkParamToSection({ parentId, paramInfoId, sectionId }) {
  const { uiTypeId } = getSectionConfig(sectionId);
  const oldChildId = getParamChildId(parentId, paramInfoId);
  if (oldChildId) {
    deleteSections({ sectionIds: [oldChildId] });
  }

  setSectionParamInfoId(sectionId, paramInfoId);
  setParamChildId({
    sectionId: parentId,
    paramInfoId,
    childId: sectionId,
  });
  setParamUITypeId({
    uiTypeId,
    sectionId: parentId,
    paramInfoId,
  });
}

function unlinkParamFromSection({ parentId, sectionId }) {
  const { paramInfoId } = useSectionInfos.getState().x[sectionId];
  if (!paramInfoId) {
    return;
  }
  setSectionParamInfoId(sectionId, null);
  setParamChildId({
    sectionId: parentId,
    paramInfoId,
    childId: null,
  });
  setParamUITypeId({
    uiTypeId: REF_UI_TYPE_ID,
    sectionId: parentId,
    paramInfoId,
  });
  setParamEnteredValue({
    sectionId: parentId,
    paramInfoId,
    value: sectionId,
  });
}
