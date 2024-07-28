import _ from "lodash";
import { useProject } from "state/definitions";

export function setProject(payload) {
  useProject.setState({ ...payload, isLoading: false });
}

export function setProjectName(name) {
  useProject.setState({ name });
}

export function getProjectMetadata() {
  return _.pick(useProject.getState(), ["id", "name", "defaultConfigId"]);
}

export function setProjectIsLoading() {
  const timeoutId = setTimeout(() => {
    useProject.setState({ isLoading: true });
  }, 500); // Delay of 500 ms

  return () => {
    clearTimeout(timeoutId);
    useProject.setState({ isLoading: false });
  };
}
