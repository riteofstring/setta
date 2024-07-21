import { useInfoView } from "state/definitions/infoView";

export function setCurrInfoView(value) {
  useInfoView.setState({ currValue: value });
}
