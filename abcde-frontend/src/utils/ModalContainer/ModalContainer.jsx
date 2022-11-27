// import {
//   Button,
//   HStack,
//   Modal,
//   ModalBody,
//   ModalCloseButton,
//   ModalContent,
//   ModalFooter,
//   ModalHeader,
//   ModalOverlay,
// } from "@chakra-ui/react";

import * as Dialog from "@radix-ui/react-dialog";
import Button from "utils/atoms/buttons/Button";

export default function ModalContainer(props) {
  const {
    // onClose,
    // isOpen,
    // isCentered = false,
    // size = "xl",
    // maxH = "auto",

    header,
    body,
    // description,
    closeText = "Close",
    footer,
  } = props;
  return (
    // <Modal
    //   onClose={onClose}
    //   isOpen={isOpen}
    //   isCentered={isCentered}
    //   size={size}
    // >
    //   <ModalOverlay />
    //   <ModalContent maxH={maxH}>
    //     <ModalHeader>{header}</ModalHeader>
    //     <ModalCloseButton />
    //     <ModalBody overflowY="auto">{body}</ModalBody>
    //     <FooterSwitch {...props} />
    //   </ModalContent>
    // </Modal>
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button>{props.children}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>{header}</Dialog.Title>
          {/* <Dialog.Description>{description}</Dialog.Description> */}
          {body}
          <Dialog.Close asChild>
            <Button></Button>
          </Dialog.Close>
          <Footer closeText={closeText}>{footer}</Footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Footer(props) {
  return (
    <div className="flex justify-self-stretch mb-2 gap-2">
      {props.children}
      <Dialog.Close asChild>
        <Button>{props.closeText}</Button>
      </Dialog.Close>
    </div>
  );
}
