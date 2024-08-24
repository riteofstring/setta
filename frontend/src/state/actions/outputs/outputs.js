import { useOutputs } from "state/definitions";

export function setAllOutputs(payload) {
  useOutputs.setState({ x: payload });
}
