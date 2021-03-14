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
import { RiPlayMiniFill } from "react-icons/ri";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function RunButton() {
  const token = useStoreState((state) => state.auth.token);

  const runSelected = useStoreActions((actions) => actions.master.runSelected);
  const exportSelected = useStoreActions(
    (actions) => actions.master.exportSelected
  );
  const runExport = () => {
    const { selected } = exportSelected();
    runSelected({ token, selected });
  };

  return (
    <ButtonGroup variant="outline" size="sm" isAttached mr=".25rem">
      <Button
        bg="whiteAlpha"
        leftIcon={<Icon as={RiPlayMiniFill} />}
        mr="-px"
        onClick={() => runExport()}
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
              <Button colorScheme="blue">Button</Button>
            </PopoverBody>
            <PopoverFooter>This is the footer</PopoverFooter>
          </PopoverContent>
        </Portal>
      </Popover>
    </ButtonGroup>
  );
}
