import { useActiveSection } from "models/activeSection";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { addKwarg } from "thunks/kwargs";
import { setParamUITypeId } from "thunks/uiTypes/setParamUITypeId";
import { setSectionUITypeConfig } from "thunks/uiTypes/setSectionUITypeConfig";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID } from "utils/constants";
import { BehaviorDropType } from "utils/DNDSortable/dropTypes";
import { insertIntoArray } from "utils/utils";
import {
  DECK,
  isRoot,
  REF_UI_TYPE_ID,
  rootTypeToChildSubType,
} from "z_utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";
import {
  SectionUITypeConfigType,
  UITypeSetOneConfigPayloadType,
} from "z_utils/types/uiType";
import { getParamChildId, setParamEnteredValue } from "../paramInfos";
import { setAllChildren } from "./children";
import { getSectionInfo, getSectionName, getSectionType } from "./getters";
import { getParamWithSameName } from "./sectionContents";
import { setAllChildrenWidths } from "./sectionSizes";
import { setSectionParamInfoId, setSectionParentId } from "./setters";

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
    position,
  });

  maybeChangeNewParamUIType({ newParentId, sectionId, behaviorDropType });

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
    p.addChildren({ [sectionId]: newSectionPosition(position) });
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
    const deckChildren = s.x[newParentId].currChildren;
    if (deckChildren.length > 0) {
      const width = s.x[deckChildren[0]].size.width;
      setAllChildrenWidths({ sectionId, width });
    }
  } else {
    const width = s.x[newParentId].size.width;
    setAllChildrenWidths({ sectionId, width });
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
    const { selectedItem } = getSectionInfo(newParentId);
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
  const { uiTypeId } = getSectionInfo(sectionId);
  const oldChildId = getParamChildId(parentId, paramInfoId);
  if (oldChildId) {
    deleteSections({ sectionIds: [oldChildId] });
  }
  setSectionParamInfoId(sectionId, paramInfoId);
  setParamUITypeId({
    uiTypeId,
    sectionId: parentId,
    paramInfoId,
  });
}

function unlinkParamFromSection({ parentId, sectionId }) {
  const { paramInfoId } = getSectionInfo(sectionId);
  if (!paramInfoId) {
    return;
  }
  setSectionParamInfoId(sectionId, null);
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
