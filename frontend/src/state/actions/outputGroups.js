import { useOutputGroups } from "state/definitions/outputGroups";

export function setAllOutputGroups(payload) {
  useOutputGroups.setState({ x: payload });
}

export function addOutputGroupsChildren({ id, name, children }) {
  useOutputGroups.setState((state) => {
    if (!(id in state.x)) {
      state.x[id] = { id, name, children };
    } else {
      const currChildren = state.x[id].children;
      for (const c of children) {
        if (!currChildren.includes(c)) {
          currChildren.push(c);
        }
      }
    }
  });
}
