import { useRunGroups } from "state/definitions/runGroups";

export function setAllRunGroups(payload) {
  useRunGroups.setState({ x: payload });
}

export function createNewRunGroup({ id, name }) {
  useRunGroups.setState((state) => {
    state.x[id] = { name, selected: 0, sections: {} };
  });
}

export function toggleRunGroup(id) {
  useRunGroups.setState((state) => {
    state.x[id].selected = !state.x[id].selected;
  });
}

export function toggleRunGroupSection({ id, sectionId }) {
  useRunGroups.setState((state) => {
    if (sectionId in state.x[id].sections) {
      delete state.x[id].sections[sectionId];
    } else {
      state.x[id].sections[sectionId] = {};
    }
  });
}

export function toggleRunGroupParamSweep({ id, sectionId, paramSweepId }) {
  useRunGroups.setState((state) => {
    const sectionIsSelected = sectionId in state.x[id].sections;
    if (sectionIsSelected && paramSweepId in state.x[id].sections[sectionId]) {
      delete state.x[id].sections[sectionId][paramSweepId];
    } else {
      if (sectionIsSelected) {
        state.x[id].sections[sectionId][paramSweepId] = true;
      } else {
        state.x[id].sections[sectionId] = { [paramSweepId]: true };
      }
    }
  });
}
