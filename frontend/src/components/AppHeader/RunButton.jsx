import { MenuBarButton } from "components/Utils/atoms/buttons/MenuBarButton";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "state/actions/project/generateCode";
import { CONST_INFO_VIEWS } from "utils/constants";

export function RunButton() {
  return (
    <MenuBarButton
      onClick={runCode}
      {...getFloatingBoxHandlers(CONST_INFO_VIEWS.BUTTON_GENERATE)}
    >
      <RiPlayMiniFill />
      Run
    </MenuBarButton>
  );
}
