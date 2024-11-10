import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useProjectConfig } from "state/definitions";

export function setProjectConfig(payload) {
  useProjectConfig.setState((state) => ({ ...state, ...payload }), true);
}
export function setProjectConfigName(name) {
  useProjectConfig.setState({ name });
}

export function getProjectConfigMetadata() {
  const state = useProjectConfig.getState();
  const output = _.pick(state, [
    "id",
    "name",
    "isDefault",
    "runGroupSelection",
    "shownRunGroup",
    "previewImgColor",
  ]);

  output.viewport = useReactFlow.getState().fitViewOnInit
    ? null
    : getViewport();

  return output;
}

export function setShownRunGroup(runGroupId) {
  useProjectConfig.setState({ shownRunGroup: runGroupId });
}
