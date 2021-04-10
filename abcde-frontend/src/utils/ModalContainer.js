import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  HStack,
  Button,
} from "@chakra-ui/react";

export default function ModalContainer(props) {
  const {
    header,
    body,
    size,
    onClose,
    isOpen,
    isCentered = true,
    maxH = "auto",
  } = props;
  return (
    <Modal
      onClose={onClose}
      isOpen={isOpen}
      isCentered={isCentered}
      size={size}
    >
      <ModalOverlay />
      <ModalContent maxH={maxH}>
        <ModalHeader>{header}</ModalHeader>
        <ModalCloseButton />
        <ModalBody overflowY="auto">{body}</ModalBody>
        <FooterSwitch {...props} />
      </ModalContent>
    </Modal>
  );
}

function FooterSwitch(props) {
  const { footer, overrideFooter = false } = props;
  return (
    <ModalFooter>
      {overrideFooter ? (
        footer
      ) : (
        <DefaultFooter {...props}>{footer}</DefaultFooter>
      )}
    </ModalFooter>
  );
}

function DefaultFooter(props) {
  const { onClose } = props;
  return (
    <HStack justify="stretch" mb=".5rem" spacing={4}>
      {props.children}
      <Button onClick={onClose}>Close</Button>
    </HStack>
  );
}
