import { useMisc } from "../stores/layoutInteractionStores";

export function activateParamSelect() {
  useMisc.setState({ isSelectingParams: true });
}

export function deactivateParamSelect() {
  useMisc.setState({ isSelectingParams: false });
}
