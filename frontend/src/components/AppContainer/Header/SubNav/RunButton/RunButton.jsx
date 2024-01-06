import { constInfoViews, useSetCurrInfoView } from "models/info/infoView";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "thunks/generateCode";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { CodeGenPopover } from "utils/atoms/popover/codegenpopover";
import { createNewId } from "z_utils/utils";

export function RunButton() {
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.BUTTON_GENERATE);
  const runExport = async () => {
    const codeId = createNewId();
    runCode({ codeId });
  };

  return (
    <CodeGenPopover
      trigger={
        <MenuBarButton onClick={runExport} {...infoViewHandlers}>
          <RiPlayMiniFill />
          Generate
        </MenuBarButton>
      }
      body={"Hmm"}
      header={"Do we still need this?"}
      closeButton={true}
    />
  );
}
