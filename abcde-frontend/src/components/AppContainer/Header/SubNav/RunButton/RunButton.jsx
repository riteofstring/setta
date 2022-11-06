import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Button,
  ButtonGroup,
  Icon,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverFooter,
  PopoverHeader,
  PopoverTrigger,
  Portal,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useCodeGenerator } from "hooks/dbRequests/codeGenerator";
import { useState } from "react";
import { RiPlayMiniFill } from "react-icons/ri";
import { createNewId } from "utils/utils";
import ExportSelectedButton from "./ExportSelectedButton";

export default function RunButton() {
  const [description, setDescription] = useState("Generating...");
  const [command, setCommand] = useState("");

  const generateCode = useCodeGenerator();
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
    <ButtonGroup variant="outline" size="xs" isAttached mr=".25rem">
      <Popover>
        <PopoverTrigger>
          <Button
            bg="whiteAlpha"
            leftIcon={<Icon as={RiPlayMiniFill} />}
            mr="-px"
            onClick={runExport}
          >
            Generate
          </Button>
        </PopoverTrigger>
        <Portal>
          <PopoverContent>
            <PopoverArrow />
            <PopoverHeader>{description}</PopoverHeader>
            <PopoverCloseButton />
            <PopoverBody>{command}</PopoverBody>
          </PopoverContent>
        </Portal>
      </Popover>

      <Popover>
        <PopoverTrigger>
          <IconButton
            bg="whiteAlpha"
            aria-label="Run Options"
            icon={<ChevronDownIcon />}
          />
        </PopoverTrigger>
        <Portal>
          <PopoverContent>
            <PopoverArrow />
            <PopoverHeader>Generate Options</PopoverHeader>
            <PopoverCloseButton />
            <PopoverBody>
              <ExportSelectedButton
                exportSelected={exportSelected}
                outputAs="code"
                buttonText="Generate Code"
              />
              <ExportSelectedButton
                exportSelected={exportSelected}
                outputAs="json"
                buttonText="Export Selected as JSON"
              />
              <ExportSelectedButton
                exportSelected={exportSelected}
                outputAs="yaml"
                buttonText="Export Selected as YAML"
              />
            </PopoverBody>
            <PopoverFooter>This is the footer</PopoverFooter>
          </PopoverContent>
        </Portal>
      </Popover>
    </ButtonGroup>
  );
}
