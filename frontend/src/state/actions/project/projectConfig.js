import _ from "lodash";
import { useProjectConfig } from "state/definitions";

export function setProjectConfig(payload) {
  useProjectConfig.setState((state) => ({ ...state, ...payload }), true);
}
export function setProjectConfigName(name) {
  useProjectConfig.setState({ name });
}

export function getProjectConfigMetadata() {
  return _.pick(useProjectConfig.getState(), [
    "id",
    "name",
    "isDefault",
    "runGroupSelection",
    "shownRunGroup",
  ]);
}

export function setShownRunGroup(runGroupId) {
  console.log("setShownRunGroup", runGroupId)
  useProjectConfig.setState({ shownRunGroup: runGroupId });
}
