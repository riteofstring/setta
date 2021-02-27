import { useState } from "react";
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
  Input,
  InputGroup,
  InputLeftAddon,
} from "@chakra-ui/react";
import { RiSave3Line } from "react-icons/ri";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function SaveButton() {
  const token = useStoreState((state) => state.auth.token);
  const currUIName = useStoreState((state) => state.uiInfo.currUIName);
  const currVersionName = useStoreState((state) => state.uiInfo.currVersionName);

  const [enteredUIName, setEnteredUIName] = useState(currUIName);
  const [enteredVersionName, setEnteredVersionName] = useState(currVersionName);

  return (
    <ButtonGroup variant="outline" size="sm" isAttached mr=".25rem">
      <Button bg="whiteAlpha" leftIcon={<Icon as={RiSave3Line} />} mr="-px">
        Save
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
            <PopoverHeader>
              <InputGroup size="sm">
                <InputLeftAddon children="UI" />
                <Input value={enteredUIName} onChange={(e)=>setEnteredUIName(e.target.value)} />
              </InputGroup>
              <InputGroup size="sm">
                <InputLeftAddon children="Version" />
                <Input value={enteredVersionName} onChange={(e)=>setEnteredVersionName(e.target.value)} />
              </InputGroup>
            </PopoverHeader>
            <PopoverCloseButton />
            <PopoverBody>
              <Button colorScheme="blue">Save As</Button>
            </PopoverBody>
          </PopoverContent>
        </Portal>
      </Popover>
    </ButtonGroup>
  );
}
