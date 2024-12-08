import C from "constants/constants.json";
import _ from "lodash";
import {
  useMisc,
  useNodeInternals,
  useProjectConfig,
  useRunGroups,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
import {
  getSectionByName,
  getSectionInfo,
  getSectionName,
  getSectionType,
} from "state/getters/sectionInfo";
import { useSectionTypeNames } from "state/hooks/uiTypes";
import { createNewId, createRandomName } from "utils/idNameCreation";
import {
  clearRunGroupSelection,
  setShownRunGroup,
} from "../project/projectConfig";

const RUNNABLE_SECTION_TYPES = [
  C.SECTION,
  C.LIST_ROOT,
  C.DICT_ROOT,
  C.DECK,
  C.GLOBAL_VARIABLES,
  C.CODE,
];

export function setAllRunGroups(payload) {
  useRunGroups.setState({ x: payload });
}

export function createFirstRunGroup() {
  if (_.size(useRunGroups.getState().x) === 0) {
    createRunGroupWithRandomName();
  }
}

export function createRunGroupWithRandomName() {
  const id = createNewId();
  initRunGroup({ id, name: createRandomName() });
  setShownRunGroup(id);
}

export function initRunGroup({ id, name }) {
  useRunGroups.setState((state) => {
    state.x[id] = { name, sections: {} };
    for (const c of useNodeInternals.getState().x.keys()) {
      if (RUNNABLE_SECTION_TYPES.includes(getSectionType(c).type)) {
        maybeInitRunGroupSection(state, id, c, null);
      }
    }
  });

  useProjectConfig.setState((state) => {
    state.runGroupSelection[id] = false;
  });
}

export function toggleRunGroup(id) {
  useProjectConfig.setState((state) => {
    state.runGroupSelection[id] = !state.runGroupSelection[id];
  });
}

function newRunGroupSection(sectionId, initVariantId) {
  return {
    selected: true,
    paramSweeps: {},
    versions: { [initVariantId ?? getSectionInfo(sectionId).variantId]: true },
  };
}

// must use inside of setState
function maybeInitRunGroupSection(
  state,
  id,
  sectionId,
  parentVariantId,
  initVariantId = null,
) {
  let isNewInit = false;
  if (!(sectionId in state.x[id].sections)) {
    state.x[id].sections[sectionId] = {};
    maybeInitAllDescendants(
      state,
      id,
      initVariantId ?? getSectionInfo(sectionId).variantId,
    );
    isNewInit = true;
  }
  if (!(parentVariantId in state.x[id].sections[sectionId])) {
    state.x[id].sections[sectionId][parentVariantId] = newRunGroupSection(
      sectionId,
      initVariantId,
    );
    isNewInit = true;
  }

  return isNewInit;
}

function maybeInitAllDescendants(state, id, variantId) {
  for (const c of useSectionVariants.getState().x[variantId].children) {
    maybeInitRunGroupSection(state, id, c, variantId);
  }
}

// must use inside of setState
function forceAllAncestorsToBeSelected(state, id, ancestors) {
  for (const [idx, a] of ancestors.entries()) {
    const parentVariantId = idx === 0 ? null : ancestors[idx - 1].variantId;
    maybeInitRunGroupSection(state, id, a.id, parentVariantId);
    const currState = state.x[id].sections[a.id][parentVariantId];
    currState.versions[a.variantId] = true;
    currState.selected = true;
  }
}

function allAncestorsAreSelected(state, id, ancestors) {
  for (const [idx, a] of ancestors.entries()) {
    const parentVariantId = idx === 0 ? null : ancestors[idx - 1].variantId;
    if (
      !state.x[id].sections[a.id]?.[parentVariantId].versions[a.variantId] ||
      !sectionIsSelected(state, id, a.id, parentVariantId)
    ) {
      return false;
    }
  }
  return true;
}

function sectionIsSelected(state, id, sectionId, parentVariantId) {
  return state.x[id].sections[sectionId]?.[parentVariantId].selected;
}

function toggleRunGroupSectionAttr({
  id,
  ancestors,
  sectionId,
  attrName,
  attrId,
  parentVariantId,
}) {
  useRunGroups.setState((state) => {
    const isNewInit = maybeInitRunGroupSection(
      state,
      id,
      sectionId,
      parentVariantId,
      attrName === "versions" ? attrId : null,
    );
    let newState;
    const thisSectionState = state.x[id].sections[sectionId][parentVariantId];
    // if not new init, and if all ancestors are selected, and (when toggling version or paramsweep) the section itself is selected
    if (
      !isNewInit &&
      allAncestorsAreSelected(state, id, ancestors) &&
      (attrName === "selected" ||
        sectionIsSelected(state, id, sectionId, parentVariantId))
    ) {
      newState = attrId
        ? !thisSectionState[attrName][attrId]
        : !thisSectionState[attrName];
    } else {
      newState = true;
    }

    if (attrId) {
      thisSectionState[attrName][attrId] = newState;
    } else {
      thisSectionState[attrName] = newState;
    }
    if (newState) {
      // if we set version or param sweep to true, we also need to set selected to true
      // (if we're already setting selected, this is redundant, but doesn't hurt)
      thisSectionState.selected = true;
      // if toggled to be selected, force all ancestors to be selected too
      forceAllAncestorsToBeSelected(state, id, ancestors);

      // if any children haven't been initialized, then it means we're
      // selecting this section or version for the first time
      // so by default we want all children to be selected too.
      if (attrName === "selected" || attrName === "versions") {
        const variantId =
          attrName === "versions"
            ? attrId
            : getSectionInfo(sectionId).variantId;
        maybeInitAllDescendants(state, id, variantId);
      }
    }
  });
}

export function toggleRunGroupSection({
  id,
  ancestors,
  sectionId,
  parentVariantId,
}) {
  toggleRunGroupSectionAttr({
    id,
    ancestors,
    sectionId,
    attrName: "selected",
    parentVariantId,
  });
}

export function toggleRunGroupSectionParamSweep({
  id,
  paramSweepId,
  ancestors,
  sectionId,
  parentVariantId,
}) {
  toggleRunGroupSectionAttr({
    id,
    ancestors,
    sectionId,
    attrName: "paramSweeps",
    attrId: paramSweepId,
    parentVariantId,
  });
}

export function toggleRunGroupSectionVersion({
  id,
  versionId,
  ancestors,
  sectionId,
  parentVariantId,
}) {
  toggleRunGroupSectionAttr({
    id,
    ancestors,
    sectionId,
    attrName: "versions",
    attrId: versionId,
    parentVariantId,
  });
}

export function setAllRunGroupsAndMaybeCreateSection(runGroups) {
  const stateFormat = {};
  for (const [name, runGroup] of Object.entries(runGroups)) {
    stateFormat[createNewId()] = {
      name,
      selected: runGroup.selected,
      sections: parsePrettyRunGroupSections(runGroup),
    };
  }

  console.log("stateFormt", stateFormat);

  setAllRunGroups(stateFormat);
  if (!useMisc.getState().singletonSections.globalParamSweep) {
    console.log("will create section");
  } else {
    console.log("section already exists");
  }
}

function parsePrettyRunGroupSections(runGroup) {
  const sections = {};
  for (const [sectionName, sectionDetails] of Object.entries(
    runGroup.sections,
  )) {
    const s = getSectionByName(sectionName);
    sections[s.id] = {};
    // TODO
    // for (const [paramSweepName, paramSweepIsSelected] of Object.entries(
    //   sectionDetails,
    // )) {
    //   sections[s.id][]
    // }
  }
  return sections;
}

export function useRunGroupListing(variantId) {
  const sectionTypeNames = useSectionTypeNames();
  return useSectionVariants((x) => {
    const output = [];
    for (const childId of x.x[variantId].children) {
      if (RUNNABLE_SECTION_TYPES.includes(sectionTypeNames[childId])) {
        output.push({ id: childId, name: getSectionName(childId) });
      }
    }
    return output;
  }, _.isEqual);
}

export function useTopLevelRunGroupListing() {
  const sectionTypeNames = useSectionTypeNames();
  return useSectionInfos((x) => {
    const output = [];
    for (const [k, v] of Object.entries(x.x)) {
      if (!v.parentId && RUNNABLE_SECTION_TYPES.includes(sectionTypeNames[k])) {
        output.push({ id: k, name: v.name });
      }
    }
    return output;
  }, _.isEqual);
}

export function deleteRunGroups(sectionIdsToDelete) {
  if (
    sectionIdsToDelete.some(
      (x) => getSectionType(x).type === C.GLOBAL_PARAM_SWEEP,
    )
  ) {
    useRunGroups.setState({ x: {} });
    clearRunGroupSelection();
  }
}
