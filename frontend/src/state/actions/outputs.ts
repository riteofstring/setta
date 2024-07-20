import { useOutputs } from "state/definitions/outputs";
import { addOutputGroupsChildren } from "./outputGroups";

export function updateOutput(data) {
  const { group, key, values } = data;
  addOutputGroupsChildren({ ...group, children: [key.id] });
  useOutputs.getState().appendValues({ ...key, values });
}
