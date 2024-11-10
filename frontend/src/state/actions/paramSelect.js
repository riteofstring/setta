import { useParamShortcuts } from "../definitions";

export function activateParamSelect() {
  useParamShortcuts.setState({ isSelectingParams: true });
}

export function deactivateParamSelect() {
  useParamShortcuts.setState({ isSelectingParams: false });
}
