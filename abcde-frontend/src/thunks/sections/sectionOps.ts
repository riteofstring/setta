import {
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
import { PANEID } from "utils/constants";
import { setParamChildId, setParamEnteredValue } from "../paramInfos";
import { setParamUITypeId, setSectionUITypeConfig } from "../uiTypes";
import { getSectionType } from "./sections";

export function deleteSections({ sectionIds }) {
  for (const sid of sectionIds) {
    deleteSection(sid);
  }
}

function deleteSection(sectionId) {
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

  const activeSectionState = useActiveSection.getState();
  const activeSection = activeSectionState.id;
  const setActiveSection = activeSectionState.setId;
  if (idsToDelete.includes(activeSection)) {
    setActiveSection(null);
  }
  sectionInfosState.removeSectionInfos(idsToDelete);
  useProjectConfig.getState().deleteChildren(idsToDelete);
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
    });
  }
}

export function moveSection({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
  position,
}) {
  maybeChangeSectionSubtype({
    newParentId,
    sectionId,
  });

  setSectionAttrBasedOnNewParent({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
  });

  if (newParentId === PANEID && position) {
    useSectionInfos.getState().setSectionInfoAttr({
      sectionId,
      attr: "initialPosition",
      value: position,
    });
  }

  maybeChangeOldParamUIType({ oldParentId, sectionId });
}

function setSectionAttrBasedOnNewParent({
  oldParentId,
  newParentId,
  sectionId,
  newIndex,
}) {
  const sectionInfosState = useSectionInfos.getState();
  const projectConfigState = useProjectConfig.getState();
  // Remove child from old parent's list
  if (oldParentId === PANEID) {
    // This means it was a top level section
    projectConfigState.deleteChildren([sectionId]);
  } else {
    sectionInfosState.setAllChildren({
      sectionId: oldParentId,
      newStateFn: (x) => x.filter((y) => y !== sectionId),
    });
  }
  if (newParentId === PANEID) {
    // This means it's becoming a top level section
    projectConfigState.addChildren([sectionId]);
  } else {
    // Add child to new parent's list
    sectionInfosState.setAllChildren({
      sectionId: newParentId,
      newStateFn: (x) => [
        ...x.slice(0, newIndex),
        sectionId,
        ...x.slice(newIndex, x.length),
      ],
    });
  }

  // Set sectionInfo's parentId
  sectionInfosState.setSectionInfoAttr({
    sectionId,
    attr: "parentId",
    value: newParentId === PANEID ? undefined : newParentId,
  });
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

function maybeChangeOldParamUIType({ oldParentId, sectionId }) {
  const { paramInfoId } = useSectionInfos.getState().x[sectionId];
  if (!paramInfoId) {
    return;
  }
  setParamChildId({
    sectionId: oldParentId,
    paramInfoId,
    childId: null,
  });

  setParamUITypeId({
    uiTypeId: REF_UI_TYPE_ID,
    sectionId: oldParentId,
    paramInfoId,
  });

  setParamEnteredValue({
    sectionId: oldParentId,
    paramInfoId,
    value: sectionId,
  });
}
