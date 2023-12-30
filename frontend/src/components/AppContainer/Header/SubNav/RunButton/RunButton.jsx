import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import { useState } from "react";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCode } from "thunks/generateCode";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { CodeGenPopover } from "utils/atoms/popover/codegenpopover";
import { createNewId } from "z_utils/utils";

export function RunButton() {
  const [description, setDescription] = useState("Generating...");
  const [command, setCommand] = useState("");
  const infoViewHandlers = useSetCurrInfoView(ConstantInfoView.BUTTON_GENERATE);
  const runExport = async () => {
    const codeId = createNewId();
    const command = `runcoder run ${codeId}`;
    setCommand(command);
    setDescription("Paste this into your command line:");
    navigator.clipboard.writeText(command);
    // const ready = await generateCode({ codeId });
    runCode({ codeId });
  };

  return (
    <>
      <CodeGenPopover
        trigger={
          <MenuBarButton onClick={runExport} {...infoViewHandlers}>
            <RiPlayMiniFill />
            Generate
          </MenuBarButton>
        }
        body={command}
        header={description}
        closeButton={true}
      />
    </>
  );
}
