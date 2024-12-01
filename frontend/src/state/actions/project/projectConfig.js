import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectConfig } from "state/definitions";

export function setProjectConfig(payload) {
  useProjectConfig.setState((state) => ({ ...state, ...payload }), true);
}
export function setProjectConfigName(name) {
  useProjectConfig.setState({ name });
}

export function getProjectConfigMetadata() {
  const state = useProjectConfig.getState();
  const output = {
    id: state.id,
    name: state.name,
    isDefault: state.isDefault,
    previewImgColor: state.previewImgColor,
  };

  output.viewport = useReactFlow.getState().fitViewOnInit
    ? null
    : getViewport();

  return output;
}
