import React from "react";
import {
  Popover,
  PopoverTrigger,
  IconButton,
  PopoverArrow,
  PopoverContent,
  PopoverCloseButton,
  useDisclosure,
} from "@chakra-ui/react";
import { BiRadar } from "react-icons/bi";
// import FocusLock from "react-focus-lock";
import ParamSweepPopover from "./ParamSweepPop";

export default function ParamSweepButton({ paramName }) {
  const { onOpen, onClose, isOpen } = useDisclosure();
  const firstFieldRef = React.useRef(null);
  return (
    <>
      <Popover
        width="15rem"
        isOpen={isOpen}
        initialFocusRef={firstFieldRef}
        onOpen={onOpen}
        onClose={onClose}
        placement="right"
        closeOnBlur={false}
      >
        <PopoverTrigger>
          <IconButton
            bg="whiteAlpha"
            size="sm"
            cursor="pointer"
            icon={<BiRadar />}
            color="gray.300"
            tabIndex="-1"
          />
        </PopoverTrigger>
        <PopoverContent p={5}>
          {/* <FocusLock returnFocus persistentFocus={false}> */}
          <PopoverArrow />
          <PopoverCloseButton />
          <ParamSweepPopover
            firstFieldRef={firstFieldRef}
            onCancel={onClose}
            key={paramName}
            paramName={paramName}
          />
          {/* </FocusLock> */}
        </PopoverContent>
      </Popover>
    </>
  );
}
