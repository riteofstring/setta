import _ from "lodash";
import { useProjectConfig } from "state/definitions";

export function setProjectConfig(payload) {
  useProjectConfig.setState(
    (state) => ({ ...state, ...payload, isLoading: false }),
    true,
  );
}
export function setProjectConfigName(name) {
  useProjectConfig.setState({ name });
}

export function getProjectConfigMetadata() {
  return _.pick(useProjectConfig.getState(), ["id", "name"]);
}

export function setProjectConfigIsLoading() {
  const timeoutId = setTimeout(() => {
    useProjectConfig.setState({ isLoading: true });
  }, 500); // Delay of 500 ms

  return () => {
    clearTimeout(timeoutId);
    useProjectConfig.setState({ isLoading: false });
  };
}
