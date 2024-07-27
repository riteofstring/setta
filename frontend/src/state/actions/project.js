import _ from "lodash";
import { useProject } from "state/definitions/project";

export function setProject(payload) {
  useProject.setState(payload);
}

export function setProjectName(name) {
  useProject.setState({ name });
}

export function getProjectMetadata() {
  return _.pick(useProject.getState(), ["id", "name", "defaultConfigId"]);
}
