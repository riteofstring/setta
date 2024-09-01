import { useOutputs } from "state/definitions";
import { addOutputGroupsChildren } from "./outputGroups";

export function setAllOutputs(payload) {
  useOutputs.setState({ x: payload });
}

export function updateOutput(data) {
  const { group, key, values } = data;
  addOutputGroupsChildren({ ...group, children: [key.id] });
  appendValues({ ...key, values });
}

function appendValues({ id, name, values }) {
  useOutputs.setState((state) => {
    if (!(id in state.x)) {
      state.x[id] = { id, name, values };
    } else {
      state.x[id].values.push(...values);
    }
  });
}
