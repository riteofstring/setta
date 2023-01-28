import { useOutputGroups } from "models/info/outputGroups";
import { useOutputs } from "models/info/outputs";

export function updateOutput(data) {
  const { group, key, values } = data;
  useOutputGroups.getState().addChildren({ ...group, children: [key.id] });
  useOutputs.getState().appendValues({ ...key, values });
}
