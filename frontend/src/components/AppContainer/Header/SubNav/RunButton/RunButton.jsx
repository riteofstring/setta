import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "state/actions/generateCode";
import { constInfoViews } from "state/definitions/infoView";
import { getInfoViewHandlers } from "state/hooks/useCurrInfoView";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { createNewId } from "z_utils/utils";

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
