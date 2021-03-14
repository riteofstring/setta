import { VscSave } from "react-icons/vsc";
import { IoDocumentTextOutline } from "react-icons/io5";
import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  Input,
  HStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  useDisclosure,
} from "@chakra-ui/react";
import UiEditButton from "./UiEditButton/UiEditButton";
import SaveLoadModal from "../../../../../utils/FileExplorer/SaveLoadModal";
import { useState, useRef } from "react";
export default function PageNav() {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const initialRef = useRef();
  const finalRef = useRef();

  return (
    <>
      <Menu>
        <MenuButton
          size="sm"
          variant="ghost"
          as={Button}
        >
          Test
        </MenuButton>
        <MenuList zIndex="11">
          <MenuItem onClick={onOpen}>
            <Button ml={4} ref={initialRef}>
              Open Modal
            </Button>

            <Modal
              initialFocusRef={initialRef}
              finalFocusRef={finalRef}
              isOpen={isOpen}
              onClose={onClose}
            >
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Create your account</ModalHeader>
                <ModalCloseButton />
                <ModalBody pb={6}>
                  <FormControl>
                    <FormLabel>First name</FormLabel>
                    <Input ref={initialRef} placeholder="First name" zIndex={20}/>
                  </FormControl>

                  <FormControl mt={4}>
                    <FormLabel>Last name</FormLabel>
                    <Input placeholder="Last name" />
                  </FormControl>
                </ModalBody>

                <ModalFooter>
                  <Button colorScheme="blue" mr={3}>
                    Save
                  </Button>
                  <Button onClick={onClose}>Cancel</Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </MenuItem>
        </MenuList>
      </Menu>
      {/* <UiEditButton /> */}
    </>
  );
}
