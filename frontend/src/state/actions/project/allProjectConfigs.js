import { useAllProjectConfigs } from "state/definitions";

export function setAllProjectConfigs(payload) {
  useAllProjectConfigs.setState({ x: payload });
}
