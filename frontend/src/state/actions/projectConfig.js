import _ from "lodash";
import { useProjectConfig } from "state/definitions/projectConfig";

export function setProjectConfig(payload) {
  useProjectConfig.setState((state) => ({ ...state, ...payload }), true);
}
export function setProjectConfigName(name) {
  useProjectConfig.setState({ name });
}

export function getProjectConfigMetadata() {
  _.pick(useProjectConfig.getState(), ["id", "name"]);
}
