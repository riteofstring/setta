import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "state/actions/project/generateCode";
import { getInfoViewHandlers } from "state/hooks/useCurrInfoView";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { constInfoViews } from "utils/constants";
import { createNewId } from "utils/idNameCreation";

export function RunButton() {
  const infoViewHandlers = getInfoViewHandlers(constInfoViews.BUTTON_GENERATE);
  const runExport = async () => {
    const codeId = createNewId();
    runCode({ codeId });
  };

  return (
    <MenuBarButton onClick={runExport} {...infoViewHandlers}>
      <RiPlayMiniFill />
      Run
    </MenuBarButton>
  );
}
