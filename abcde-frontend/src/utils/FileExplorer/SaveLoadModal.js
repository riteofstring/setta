import { useState, useRef } from "react";
import {
  HStack,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  useDisclosure,
} from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveAsButton() {

  const { isOpen, onOpen, onClose } = useDisclosure()

  const initialRef = useRef()
  const finalRef = useRef()

  return (
    <>
      <Button onClick={onOpen}>Open Modal</Button>
      <Button ml={4} ref={finalRef}>
        I'll receive focus on close
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
              <Input ref={initialRef} placeholder="First name" />
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
    </>
  )

  // const { onClose, isOpen, ButtonText, savedFolderAndUINames } = props;

  // const [selectedFolderName, setSelectedFolderName] = useState(null);
  // const [selectedFileName, setSelectedFileName] = useState(null);
  // // const [enteredFileName, setEnteredFileName] = useState("");

  // const initialRef = useRef()

  // const onSaveOrLoadClick = () => {
  //   if (ButtonText === "Save As") {
  //   } else if (ButtonText === "Load") {
  //     console.log("not implemented");
  //   }

  //   onClose();
  // };

  // return (
  //   <>
  //     <Modal initialFocusRef={initialRef} onClose={onClose} isOpen={isOpen} isCentered size="6xl">
  //       <ModalOverlay />
  //       <ModalContent>
  //         <ModalHeader>
  //           {ButtonText === "Save As" ? "Save Project As" : "Load Project"}
  //         </ModalHeader>
  //         <ModalCloseButton />
  //         <ModalBody>
  //           {/* <FileExplorer
  //             folderAndFileInfo={savedFolderAndUINames}
  //             onFileSelect={setSelectedFileName}
  //             onFolderSelect={setSelectedFolderName}
  //           /> */}
  //           {/* {ButtonText === "Save As" && ( */}
  //           {/* <FileNameInput /> */}
  //           <FormControl>
  //             <FormLabel>Last name</FormLabel>
  //             <Input ref={initialRef}/>
  //           </FormControl>
  //           {/* )} */}
  //         </ModalBody>
  //         <ModalFooter>
  //           <HStack justify="stretch" mb=".5rem" spacing={4}>
  //             <Button colorScheme="blue" onClick={onSaveOrLoadClick}>
  //               {ButtonText}
  //             </Button>
  //             <Button onClick={onClose}>Close</Button>
  //           </HStack>
  //         </ModalFooter>
  //       </ModalContent>
  //     </Modal>
  //   </>
  // );
}
