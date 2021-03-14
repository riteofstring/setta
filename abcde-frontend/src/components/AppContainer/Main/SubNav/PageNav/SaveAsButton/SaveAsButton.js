import { useState } from "react";
import {
  HStack,
  VStack,
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Flex,
  Input,
  InputGroup,
  MenuItem,
  useRadio,
} from "@chakra-ui/react";
import { VscSaveAs } from "react-icons/vsc";
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
                <FolderItem />
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
  );
}

function FolderItem(props) {
  const { getInputProps, getCheckboxProps } = useRadio(props);

  const input = getInputProps();
  const checkbox = getCheckboxProps();

  return (
    <Box as="label">
      <input {...input} />
      <Box
        {...checkbox}
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        boxShadow="md"
        _checked={{
          bg: "gray.600",
          color: "white",
          borderColor: "gray.600",
        }}
        _focus={{
          boxShadow: "outline",
        }}
        px={5}
        py={3}
      >
        {props.children}
      </Box>
    </Box>
  );
}
