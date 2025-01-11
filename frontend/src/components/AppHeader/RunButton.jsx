import { MenuBarButton } from "components/Utils/atoms/buttons/MenuBarButton";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { RiPlayMiniFill } from "react-icons/ri";
import { runOrImportAllCodeSections } from "state/actions/runOrImportCode";

export function RunButton() {
  return (
    <MenuBarButton
      onClick={runOrImportAllCodeSections}
      {...getFloatingBoxHandlers("Run your code.")}
    >
      <RiPlayMiniFill />
      Run
    </MenuBarButton>
  );
}
