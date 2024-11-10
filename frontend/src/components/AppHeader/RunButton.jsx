import { MenuBarButton } from "components/Utils/atoms/buttons/MenuBarButton";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "state/actions/project/generateCode";

export function RunButton() {
  return (
    <MenuBarButton
      onClick={runCode}
      {...getFloatingBoxHandlers("Run your code.")}
    >
      <RiPlayMiniFill />
      Run
    </MenuBarButton>
  );
}
