import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "thunks/generateCode";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { CodeGenPopover } from "utils/atoms/popover/codegenpopover";
import { createNewId } from "z_utils/utils";

export function RunButton() {
  const infoViewHandlers = useSetCurrInfoView(ConstantInfoView.BUTTON_GENERATE);
  const runExport = () => {
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
      body={"Do we still need this?"}
      header={"Hmm"}
      closeButton={true}
    />
  );
}
