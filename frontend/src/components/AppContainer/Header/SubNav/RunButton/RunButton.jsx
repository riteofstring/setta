import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "state/actions/generateCode";
import { constInfoViews, useSetCurrInfoView } from "state/definitions/infoView";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { createNewId } from "z_utils/utils";

export function RunButton() {
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.BUTTON_GENERATE);
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
