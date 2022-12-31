import { createNewId } from "abcde-utils/src/utils";
import { useState } from "react";
import { RiPlayMiniFill } from "react-icons/ri";
import { generateCode } from "thunks/generateCode";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";

export default function RunButton() {
  const [description, setDescription] = useState("Generating...");
  const [command, setCommand] = useState("");
  const runExport = async () => {
    const codeId = createNewId();
    const command = `runcoder run ${codeId}`;
    setCommand(command);
    setDescription("Paste this into your command line:");
    navigator.clipboard.writeText(command);
    const ready = await generateCode({ codeId });
  };

  return (
    <>
      <PopoverWrapper
        trigger={
          <MenuBarButton onClick={runExport}>
            <RiPlayMiniFill />
            Generate Command
          </MenuBarButton>
        }
        body={command}
        header={description}
        closeButton={true}
      />
      {/* <PopoverWrapper
        trigger={
          <MenuBarButton aria-label="Run Options">
            <BiChevronDown />
          </MenuBarButton>
        }
        body={"Options..."}
        header={"Generate Options"}
        closeButton={true}
      /> */}
    </>
  );
}
