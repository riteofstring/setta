import { ChevronDownIcon } from "@chakra-ui/icons";
import { Button, ButtonGroup, Icon, IconButton } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useState } from "react";
import { RiPlayMiniFill } from "react-icons/ri";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";
import { createNewId } from "utils/utils";

export default function RunButton() {
  const [description, setDescription] = useState("Generating...");
  const [command, setCommand] = useState("");
  const generateCode = useStoreActions((x) => x.thunks.generateCode);
  const runExport = async () => {
    const codeId = createNewId();
    const command = `runcoder run ${codeId}`;
    setCommand(command);
    setDescription("Paste this into your command line:");
    navigator.clipboard.writeText(command);
    const ready = await generateCode({ codeId });
  };

  return (
    <ButtonGroup variant="outline" size="xs" isAttached mr=".25rem">
      <PopoverWrapper
        trigger={
          <Button
            bg="whiteAlpha"
            leftIcon={<Icon as={RiPlayMiniFill} />}
            mr="-px"
            onClick={runExport}
          >
            Generate
          </Button>
        }
        body={command}
        header={description}
        closeButton={true}
      />
      <PopoverWrapper
        trigger={
          <IconButton
            bg="whiteAlpha"
            aria-label="Run Options"
            icon={<ChevronDownIcon />}
          />
        }
        body={"Options..."}
        header={"Generate Options"}
        closeButton={true}
      />
    </ButtonGroup>
  );
}
