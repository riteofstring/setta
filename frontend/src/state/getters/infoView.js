import { setCurrInfoView } from "state/actions/infoView";

export function getInfoViewHandlers(value) {
  function onMouseOver() {
    setCurrInfoView(value);
  }

  function onMouseLeave() {
    setCurrInfoView("");
  }

  return { onMouseOver, onMouseLeave };
}
