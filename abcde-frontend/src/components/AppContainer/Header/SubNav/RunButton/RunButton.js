import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  ButtonGroup,
  Button,
  IconButton,
  Icon,
  Popover,
  PopoverBody,
  PopoverTrigger,
  Portal,
  PopoverContent,
  PopoverArrow,
  PopoverHeader,
  PopoverCloseButton,
  PopoverFooter,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { RiPlayMiniFill } from "react-icons/ri";

import ExportSelectedButton from "./ExportSelectedButton";

export default function RunButton() {
  // const runSelected = useStoreActions((actions) => actions.master.runSelected);
  const exportSelected = useStoreActions((x) => x.master.exportSelected);
  const runExport = () => {
    const selected = exportSelected();
    // runSelected({ selected });
  };

  return (
    <ButtonGroup variant="outline" size="xs" isAttached mr=".25rem">
      <Button
        bg="whiteAlpha"
        leftIcon={<Icon as={RiPlayMiniFill} />}
        mr="-px"
        onClick={runExport}
      >
        Run
      </Button>
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
            <PopoverHeader>Run Options</PopoverHeader>
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
