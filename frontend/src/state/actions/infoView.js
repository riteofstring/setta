import { useInfoView } from "state/definitions";

export function setCurrInfoView(value) {
  useInfoView.setState({ currValue: value });
}
