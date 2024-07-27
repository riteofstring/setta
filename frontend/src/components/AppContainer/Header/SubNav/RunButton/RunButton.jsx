import { RiPlayMiniFill } from "react-icons/ri";
import { getInfoViewHandlers } from "state/actions/infoView";
import { runCode } from "state/actions/project/generateCode";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { constInfoViews } from "utils/constants";
import { createNewId } from "utils/idNameCreation";

export function RunButton() {
  const runExport = async () => {
    const codeId = createNewId();
    runCode({ codeId });
  };

  return (
    <MenuBarButton
      onClick={runExport}
      {...getInfoViewHandlers(constInfoViews.BUTTON_GENERATE)}
    >
      <RiPlayMiniFill />
      Run
    </MenuBarButton>
  );
}
