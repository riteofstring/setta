import { useInfoView } from "state/definitions";

function setCurrInfoView(value) {
  useInfoView.setState({ currValue: value });
}

export function getInfoViewHandlers(value) {
  function onMouseOver() {
    setCurrInfoView(value);
  }

  function onMouseLeave() {
    setCurrInfoView("");
  }

  return { onMouseOver, onMouseLeave };
}

