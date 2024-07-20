import { useOutputGroups } from "state/definitions/outputGroups";
import { useOutputs } from "state/definitions/outputs";

export function updateOutput(data) {
  const { group, key, values } = data;
  useOutputGroups.getState().addChildren({ ...group, children: [key.id] });
  useOutputs.getState().appendValues({ ...key, values });
}
