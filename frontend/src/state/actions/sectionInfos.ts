import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { dbGetJSONSourcePathToBeDeleted } from "requests/jsonSource";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { VIEWING_EDITING_MODE } from "utils/constants";
import { createCodeInfoCol, createEVEntry } from "utils/generated_schemas";
import { createNewId } from "utils/idNameCreation";
import { openDeleteJSONSourceFileModal } from "./modal";
import { getCurrentProjectConfig } from "./project/loadProject";
import { waitForFileDeletion } from "./temporaryMiscState";

export function getSectionInfo(sectionId) {
  return useProjectState.getState().sections[sectionId];
}

export function getSectionParentId(sectionId) {
  return getSectionInfo(sectionId).parentId;
}

export function getSectionType(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.uiTypes[state.sections[sectionId].uiTypeId].type;
}

export function getSectionVariant(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.variants[state.sections[sectionId].variantId];
}

export function getHighestAncestor(
  sectionId,
  parentIdGetter = getSectionParentId,
) {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;

  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }

  return highestAncestor;
}

export function getSectionPathFullName(sectionId, state) {
  let parentId = state.sections[sectionId].parentId;
  if (!parentId) {
    return state.sections[sectionId].name;
  }

  let childId = sectionId;
  let output = "";
  while (parentId) {
    if (getSectionType(parentId, state) === C.LIST_ROOT) {
      const idx = getSectionVariant(parentId, state).children.indexOf(
        sectionId,
      );
      output = `[${idx}]${output}`;
    } else {
      output = `["${state.sections[childId].name}"]${output}`;
    }
    childId = parentId;
    parentId = state.sections[parentId].parentId;
  }

  // childId will contain the highest parent's id
  return `${state.sections[childId].name}${output}`;
}

export function getSectionDescendants(sectionId, state) {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    ids.push(...getSectionVariant(currId, state).children);
    idx += 1;
  }
  return ids;
}

export function toggleSectionOrientation(sectionId) {
  useProjectState.setState((state) => {
    state.sections[sectionId].isHorizontalOrientation =
      !state.sections[sectionId].isHorizontalOrientation;
  });
}

export function toggleSectionLock(sectionId) {
  useProjectState.setState((state) => {
    state.sections[sectionId].positionAndSizeLocked =
      !state.sections[sectionId].positionAndSizeLocked;
  });
}

export function manualDndChildrenReset() {
  useDndChildren.getState().update(getDisplayedSectionIdToChildren());
}

export function setAllPreviewVariantIdsToNull() {
  useProjectState.setState((x) => {
    for (const s of Object.values(x.sections)) {
      s.previewVariantId = null;
    }
  });
}

export function updateSectionInfos({
  sections,
  variants,
  uiTypes,
  uiTypeCols,
  codeInfo,
  codeInfoCols,
  state,
}) {
  state.sections = { ...state.sections, ...sections };
  state.variants = { ...state.variants, ...variants };
  state.uiTypes = { ...state.uiTypes, ...uiTypes };
  state.uiTypeCols = { ...state.uiTypeCols, ...uiTypeCols };
  state.codeInfo = { ...state.codeInfo, ...codeInfo };
  state.codeInfoCols = { ...state.codeInfoCols, ...codeInfoCols };
}

export function setEnteredValue(variantId, paramInfoId, value, state) {
  if (!(paramInfoId in state.variants[variantId].values)) {
    state.variants[variantId].values[paramInfoId] = createEVEntry();
  }
  state.variants[variantId].values[paramInfoId].value = value;
}

export function setParamEnteredValue(sectionId, paramInfoId, value, state) {
  setEnteredValue(
    state.sections[sectionId].variantId,
    paramInfoId,
    value,
    state,
  );
}

export function getCodeInfoCol(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  const codeInfoColId = getSectionVariant(sectionId, state).codeInfoColId;
  return codeInfoColId
    ? state.codeInfoCols[codeInfoColId]
    : createCodeInfoCol();
}

export function getDisplayedCodeInfoCol(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.codeInfoCols[
    getDisplayedSectionVariant(sectionId, state).codeInfoColId
  ];
}

export function getDisplayedSectionVariant(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.variants[getDisplayedSectionVariantId(sectionId, state)];
}

export function getDisplayedSectionVariantId(sectionId, _state) {
  const state = _state ?? useProjectState.getState();
  return (
    state.sections[sectionId].previewVariantId ??
    state.sections[sectionId].variantId
  );
}

export function setSectionVariantChildren(sectionId, newStateFn, state) {
  const variant = getSectionVariant(sectionId, state);
  variant.children = newStateFn(variant.children);
}

function getDisplayedSectionIdToChildrenHelper(sectionId, state, output) {
  const children = getDisplayedSectionVariant(sectionId, state).children;
  output[sectionId] = children;
  if (children) {
    for (const childId of children) {
      getDisplayedSectionIdToChildrenHelper(childId, state, output);
    }
  }
}

export function getDisplayedSectionIdToChildren(
  state,
  includeNullAsRoot = false,
) {
  const output = {};
  const s = state ?? useProjectState.getState();
  for (const section of Object.values(s.sections)) {
    if (!section.parentId) {
      getDisplayedSectionIdToChildrenHelper(section.id, s, output);
      if (includeNullAsRoot) {
        if (!(null in output)) {
          output[null] = [];
        }
        output[null].push(section.id);
      }
    }
  }
  return output;
}

export function getSectionIdToParentId(state) {
  const output = {};
  const s = state ?? useProjectState.getState();
  for (const section of Object.values(s.sections)) {
    output[section.id] = section.parentId;
  }
  return output;
}

function getSectionDescendantsFromAllVariants(sectionId, state) {
  const output = [];
  for (const v of state.sections[sectionId].variantIds) {
    output.push(...state.variants[v].children);
  }
  return output;
}

export function getAllSectionsForDeletionOrCopying(sectionIds, state) {
  const idsToDelete = [...sectionIds];
  let idx = 0;
  while (idx < idsToDelete.length) {
    const idxChildren = getSectionDescendantsFromAllVariants(
      idsToDelete[idx],
      state,
    );
    const { paramSweepSectionId } = state.sections[idsToDelete[idx]];
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

export function setDefaultSectionVariant(sectionId, variantId) {
  useProjectState.setState((x) => {
    x.sections[sectionId].defaultVariantId = variantId;
  });
}

export function resetSectionsToDefaultVersions(sectionIds) {
  useProjectState.setState((x) => {
    for (const id of sectionIds) {
      const s = x.sections[id];
      s.variantId = s.defaultVariantId;
    }
  });
}

export function resetAllSectionsToDefaultVersions() {
  resetSectionsToDefaultVersions(
    Object.keys(useProjectState.getState().sections),
  );
}

export function duplicateCodeInfoCol(id, state) {
  const newId = createNewId();
  const s = state.codeInfoCols;
  s[newId] = _.cloneDeep(s[id]);
  return newId;
}

export function duplicateSectionVariant(id, newName, newCodeInfoColId, state) {
  const newId = createNewId();
  const s = state.variants;
  s[newId] = _.cloneDeep(s[id]);
  s[newId].name = newName;
  s[newId].codeInfoColId = newCodeInfoColId;
  s[newId].isFrozen = false;
  return newId;
}

export function getCodeChildrenAndParentCodeInfoId(
  sectionId,
  state,
  variantId = null,
) {
  const sectionVariant = variantId
    ? state.variants[variantId]
    : getDisplayedSectionVariant(sectionId, state);
  const { codeInfoColId } = sectionVariant;
  const parentCodeInfoId = sectionVariant.selectedItem;

  const codeInfoChildren = codeInfoColId
    ? state.codeInfoCols[codeInfoColId].children
    : createCodeInfoCol().children;

  return { codeInfoChildren, parentCodeInfoId };
}

export async function deleteSectionVariantAndMaybeJsonFile(
  sectionId,
  variantId,
  isCurr,
) {
  const state = useProjectState.getState();
  const { name: variantName, isJsonSource } = state.variants[variantId];
  if (isJsonSource) {
    const res = await dbGetJSONSourcePathToBeDeleted(variantName);
    if (res.status == 200) {
      openDeleteJSONSourceFileModal(res.data);
      const wasDeleted = await waitForFileDeletion(res.data);
      if (wasDeleted) {
        deleteSectionVariant(sectionId, variantId, isCurr);
      }
    }
  } else {
    deleteSectionVariant(sectionId, variantId, isCurr);
  }
}

function deleteSectionVariant(sectionId, variantId, isCurr) {
  useProjectState.setState((state) => {
    const section = state.sections[sectionId];
    section.variantIds = section.variantIds.filter((v) => v !== variantId);
    if (section.defaultVariantId === variantId) {
      section.defaultVariantId = section.variantIds[0];
    }
    if (isCurr) {
      section.variantId = section.variantIds[0];
    }
    delete state.variants[variantId];
  });
}

export function getSectionShouldRender(visibility, viewingEditingMode) {
  return visibility || viewingEditingMode !== VIEWING_EDITING_MODE.USER;
}

export function getSectionViewingEditingModeVisibility(sectionId, state) {
  const { viewingEditingMode } = getCurrentProjectConfig(state);
  return {
    visibility:
      state.sections[sectionId].visibility[
        getSectionVisibilityKey(viewingEditingMode)
      ],
    viewingEditingMode,
  };
}

export function getSectionVisibilityKey(viewingEditingMode) {
  switch (viewingEditingMode) {
    case VIEWING_EDITING_MODE.DEV:
    case VIEWING_EDITING_MODE.USER:
      return viewingEditingMode;
    case VIEWING_EDITING_MODE.USER_EDIT:
      return VIEWING_EDITING_MODE.USER;
  }
}

export function getSectionVisibilityKeyForDisplay(viewingEditingMode) {
  switch (viewingEditingMode) {
    case VIEWING_EDITING_MODE.USER:
      return viewingEditingMode;
    case VIEWING_EDITING_MODE.DEV:
    case VIEWING_EDITING_MODE.USER_EDIT:
      return VIEWING_EDITING_MODE.DEV;
  }
}

export function getAncestorSameVisibility(sectionId, state) {
  const { viewingEditingMode } = getCurrentProjectConfig(state);
  let { parentId } = state.sections[sectionId];
  const key = getSectionVisibilityKey(viewingEditingMode);
  const targetVisibility = state.sections[sectionId].visibility[key];

  while (parentId) {
    if (state.sections[parentId].visibility[key] === targetVisibility)
      return true;

    ({ parentId } = state.sections[parentId]);
  }

  return false;
}

export function getIsUserView(viewingEditingMode) {
  return viewingEditingMode === VIEWING_EDITING_MODE.USER;
}
