import { useArtifacts } from "state/definitions";

export function setAllOutputs(payload) {
  useArtifacts.setState({ x: payload });
}
