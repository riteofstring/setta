import { useState } from "react";
import {
  HStack,
  VStack,
  Box,
  ButtonGroup,
  Button,
  IconButton,
  Icon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Flex,
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
  MenuItem,
} from "@chakra-ui/react";
import { RiSave3Line } from "react-icons/ri";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function SaveAsButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const token = useStoreState((state) => state.auth.token);
  const currUIName = useStoreState((state) => state.uiInfo.currUIName);
  const currVersionName = useStoreState(
    (state) => state.uiInfo.currVersionName
  );
  const saveUI = useStoreActions((actions) => actions.uiInfo.saveUI);

  const [enteredUIName, setEnteredUIName] = useState(currUIName);
  const [enteredVersionName, setEnteredVersionName] = useState(currVersionName);

  const onSaveAs = () => {
    saveUI({ token, uiName: enteredUIName, versionName: enteredVersionName });
  };

  return (
    <>
      <MenuItem onClick={onOpen} icon={<VscSaveAs />}>
        Save As
      </MenuItem>

      <Modal onClose={onClose} isOpen={isOpen} isCentered size="6xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Save Project As</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <HStack h="40vh">
              <VStack
                h="inherit"
                w="40%"
                border="1px"
                borderColor="gray.200"
                borderRadius="lg"
                spacing={4}
                align="stretch"
                overflowY="auto"
                px="1.5rem"
                py="1rem"
              >
                <Box>test</Box>
              </VStack>
              <Flex
                h="inherit"
                w="60%"
                border="1px"
                borderColor="gray.200"
                borderRadius="lg"
                overflowY="auto"
              ></Flex>
            </HStack>

            <HStack mt="1.25rem" spacing={4}>
              <InputGroup>
                <Input
                  variant="flushed"
                  value={enteredUIName}
                  placeholder="Project Name"
                  onChange={(e) => setEnteredUIName(e.target.value)}
                />
              </InputGroup>
              <InputGroup>
                <Input
                  variant="flushed"
                  value={enteredVersionName}
                  placeholder="Version"
                  onChange={(e) => setEnteredVersionName(e.target.value)}
                />
              </InputGroup>
            </HStack>
          </ModalBody>
          <ModalFooter>
            <HStack mb=".5rem" spacing={4}>
              <Button colorScheme="blue" onClick={onSaveAs}>
                Save As
              </Button>
              <Button onClick={onClose}>Close</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
    // <ButtonGroup variant="outline" size="sm" isAttached mr=".25rem">
    //   <Button bg="whiteAlpha" leftIcon={<Icon as={RiSave3Line} />} mr="-px">
    //     Save
    //   </Button>
    //   <Popover>
    //     <PopoverTrigger>
    //       <IconButton
    //         bg="whiteAlpha"
    //         aria-label="Run Options"
    //         icon={<ChevronDownIcon />}
    //       />
    //     </PopoverTrigger>
    //     <Portal>
    //       <PopoverContent>
    //         <PopoverArrow />
    //         <PopoverHeader>
    //           <InputGroup size="sm">
    //             <InputLeftAddon children="UI" />
    //             <Input value={enteredUIName} onChange={(e)=>setEnteredUIName(e.target.value)} />
    //           </InputGroup>
    //           <InputGroup size="sm">
    //             <InputLeftAddon children="Version" />
    //             <Input value={enteredVersionName} onChange={(e)=>setEnteredVersionName(e.target.value)} />
    //           </InputGroup>
    //         </PopoverHeader>
    //         <PopoverCloseButton />
    //         <PopoverBody>
    //           <Button colorScheme="blue" onClick={onSaveAs}>Save As</Button>
    //         </PopoverBody>
    //       </PopoverContent>
    //     </Portal>
    //   </Popover>
    // </ButtonGroup>
  );
}
