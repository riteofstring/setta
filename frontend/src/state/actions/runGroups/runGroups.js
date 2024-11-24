import { useMisc, useProjectConfig, useRunGroups } from "state/definitions";
import { getSectionByName } from "state/getters/sectionInfo";
import { createNewId } from "utils/idNameCreation";

export function setAllRunGroups(payload) {
  useRunGroups.setState({ x: payload });
}

export function initRunGroup({ id, name }) {
  useRunGroups.setState((state) => {
    state.x[id] = { name, sections: {} };
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

function newRunGroupSection() {
  return {
    selected: {}, // maps from parent version id to true/false
    paramSweeps: {},
    versions: {},
  };
}

// must use inside of setState
function maybeInitRunGroupSection(state, id, sectionId) {
  if (!(sectionId in state.x[id].sections)) {
    state.x[id].sections[sectionId] = newRunGroupSection();
  }
}

// must use inside of setState
function forceAllAncestorsToBeSelected(state, id, ancestors) {
  for (const [idx, a] of ancestors.entries()) {
    maybeInitRunGroupSection(state, id, a.id);
    state.x[id].sections[a.id].versions[a.variantId] = true;
    state.x[id].sections[a.id].selected[
      idx === 0 ? null : ancestors[idx - 1].variantId
    ] = true;
  }
}

function allAncestorsAreSelected(state, id, ancestors) {
  for (const [idx, a] of ancestors.entries()) {
    if (
      !state.x[id].sections[a.id]?.versions[a.variantId] ||
      !state.x[id].sections[a.id]?.selected[
        idx === 0 ? null : ancestors[idx - 1].variantId
      ]
    ) {
      return false;
    }
  }
  return true;
}

export function toggleRunGroupSection({
  id,
  parentVariantId,
  ancestors,
  sectionId,
}) {
  console.log("toggleRunGroupSection");
  useRunGroups.setState((state) => {
    maybeInitRunGroupSection(state, id, sectionId);
    let newState;
    if (allAncestorsAreSelected(state, id, ancestors)) {
      newState = !state.x[id].sections[sectionId].selected[parentVariantId];
    } else {
      newState = true;
    }
    state.x[id].sections[sectionId].selected[parentVariantId] = newState;
    // if toggled to be selected, force all ancestors to be selected too
    if (newState) {
      forceAllAncestorsToBeSelected(state, id, ancestors);
    }
  });
}

function toggleRunGroupSectionAttr({
  id,
  parentVersionId,
  sectionId,
  attrName,
  attrId,
}) {
  maybeInitRunGroupSectionAttr({
    id,
    sectionId,
    attrName,
    attrId,
  });
  useRunGroups.setState((state) => {
    const s = state.x[id].sections[sectionId];
    if (s.selected[parentVersionId]) {
      s[attrName][attrId] = !s[attrName][attrId];
    } else {
      for (const _attrId of Object.keys(s[attrName])) {
        s[attrName][_attrId] = _attrId === attrId;
      }
      s.selected[parentVersionId] = true;
    }
  });
}

export function toggleRunGroupSectionParamSweep({
  id,
  parentVersionId,
  sectionId,
  paramSweepId,
}) {
  toggleRunGroupSectionAttr({
    id,
    parentVersionId,
    sectionId,
    attrName: "paramSweeps",
    attrId: paramSweepId,
  });
}

export function toggleRunGroupSectionVersion({
  id,
  parentVersionId,
  sectionId,
  versionId,
}) {
  toggleRunGroupSectionAttr({
    id,
    parentVersionId,
    sectionId,
    attrName: "versions",
    attrId: versionId,
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
