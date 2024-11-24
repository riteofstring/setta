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

function maybeInitRunGroupSection({ id, sectionId }) {
  useRunGroups.setState((state) => {
    if (!(sectionId in state.x[id].sections)) {
      state.x[id].sections[sectionId] = {
        selected: {}, // maps from parent version id to true/false
        paramSweeps: {},
        versions: {},
      };
    }
  });
}

export function toggleRunGroupSection({ id, parentVersionId, sectionId }) {
  maybeInitRunGroupSection({ id, sectionId });
  useRunGroups.setState((state) => {
    const s = state.x[id].sections[sectionId];
    s.selected[parentVersionId] = !s.selected[parentVersionId];
  });
}

function maybeInitRunGroupSectionAttr({ id, sectionId, attrName, attrId }) {
  maybeInitRunGroupSection({ id, sectionId });
  useRunGroups.setState((state) => {
    if (!(attrId in state.x[id].sections[sectionId][attrName])) {
      state.x[id].sections[sectionId][attrName][attrId] = false;
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
