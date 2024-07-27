import { RiPlayMiniFill } from "react-icons/ri";
import { getInfoViewHandlers } from "state/actions/infoView";
import { runCode } from "state/actions/project/generateCode";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { constInfoViews } from "utils/constants";

export function RunButton() {
  return (
    <MenuBarButton
      onClick={runCode}
      {...getInfoViewHandlers(constInfoViews.BUTTON_GENERATE)}
    >
      <RiPlayMiniFill />
      Run
    </MenuBarButton>
  );
}
