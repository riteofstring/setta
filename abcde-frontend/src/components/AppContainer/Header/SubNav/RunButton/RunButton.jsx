import { useStoreActions } from "easy-peasy";
import { useState } from "react";
import { BiChevronDown } from "react-icons/bi";
import { RiPlayMiniFill } from "react-icons/ri";
import MenuBarButton from "utils/atoms/buttons/MenuBarButton";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";
import { createNewId } from "utils/utils";

export default function RunButton() {
  const [description, setDescription] = useState("Generating...");
  const [command, setCommand] = useState("");
  const generateCode = useStoreActions((x) => x.thunks.generateCode);
  const exportSelected = useStoreActions((x) => x.master.exportSelected);
  const runExport = async () => {
    const codeId = createNewId();
    const command = `runcoder run ${codeId}`;
    setCommand(command);
    setDescription("Paste this into your command line:");
    navigator.clipboard.writeText(command);
    const codeJson = exportSelected();
    const ready = await generateCode({ codeId, codeJson });
  };

  return (
    <>
      <PopoverWrapper
        trigger={
          <MenuBarButton onClick={runExport}>
            <RiPlayMiniFill />
            Generate
          </MenuBarButton>
        }
        body={command}
        header={description}
        closeButton={true}
      />
      <PopoverWrapper
        trigger={
          <MenuBarButton aria-label="Run Options">
            <BiChevronDown />
          </MenuBarButton>
        }
        body={"Options..."}
        header={"Generate Options"}
        closeButton={true}
      />
    </>
  );
}
