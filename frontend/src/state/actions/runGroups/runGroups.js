import { useProjectConfig, useRunGroups } from "state/definitions";
import { getSectionByName } from "state/getters/sectionInfo";
import { SINGLETON_SECTIONS } from "utils/constants";
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

export function maybeInitRunGroupSection({ id, sectionId }) {
  useRunGroups.setState((state) => {
    if (!(sectionId in state.x[id].sections)) {
      state.x[id].sections[sectionId] = {
        selected: false,
        paramSweeps: {},
        versions: {},
      };
    }
  });
}

export function toggleRunGroupSection({ id, sectionId }) {
  maybeInitRunGroupSection({ id, sectionId });
  useRunGroups.setState((state) => {
    const s = state.x[id].sections[sectionId];
    s.selected = !s.selected;
  });
}

export function maybeInitRunGroupSectionAttr({
  id,
  sectionId,
  attrName,
  attrId,
}) {
  maybeInitRunGroupSection({ id, sectionId });
  useRunGroups.setState((state) => {
    if (!(attrId in state.x[id].sections[sectionId][attrName])) {
      state.x[id].sections[sectionId][attrName][attrId] = false;
    }
  });
}

export function toggleRunGroupSectionAttr({ id, sectionId, attrName, attrId }) {
  maybeInitRunGroupSectionAttr({
    id,
    sectionId,
    attrName,
    attrId,
  });
  useRunGroups.setState((state) => {
    const s = state.x[id].sections[sectionId];
    if (s.selected) {
      s[attrName][attrId] = !s[attrName][attrId];
    } else {
      for (const _attrId of Object.keys(s[attrName])) {
        s[attrName][_attrId] = _attrId === attrId;
      }
      s.selected = true;
    }
  });
}

export function toggleRunGroupSectionParamSweep({
  id,
  sectionId,
  paramSweepId,
}) {
  toggleRunGroupSectionAttr({
    id,
    sectionId,
    attrName: "paramSweeps",
    attrId: paramSweepId,
  });
}

export function toggleRunGroupSectionVersion({ id, sectionId, versionId }) {
  toggleRunGroupSectionAttr({
    id,
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
  if (!SINGLETON_SECTIONS.globalParamSweep) {
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
