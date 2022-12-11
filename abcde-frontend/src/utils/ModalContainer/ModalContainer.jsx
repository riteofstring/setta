import * as Dialog from "@radix-ui/react-dialog";
import "./styles.css";

export default function ModalContainer({
  open,
  onOpenChange,
  body,
  footer,
  returnFocusTo,
}) {

  console.log("returnFocusTo", returnFocusTo)
  function onCloseAutoFocus(event) {
    event.preventDefault();
    returnFocusTo.current.focus();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay" />
        <Dialog.Content
          className="DialogContent"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {/* {body}
          {footer} */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// export default function ModalContainer(props) {
//   const {
//     onClose,
//     isOpen,
//     isCentered = false,
//     size = "xl",
//     maxH = "auto",
//     header,
//     body,
//   } = props;
//   return (
//     <Modal
//       onClose={onClose}
//       isOpen={isOpen}
//       isCentered={isCentered}
//       size={size}
//     >
//       <ModalOverlay />
//       <ModalContent maxH={maxH}>
//         <ModalHeader>{header}</ModalHeader>
//         <ModalCloseButton />
//         <ModalBody overflowY="auto">{body}</ModalBody>
//         <FooterSwitch {...props} />
//       </ModalContent>
//     </Modal>
//   );
// }

// function FooterSwitch(props) {
//   const { overrideFooter, footer } = props;

//   return (
//     <ModalFooter>
//       {overrideFooter ? footer : <DefaultFooter {...props} />}
//     </ModalFooter>
//   );
// }

// function DefaultFooter(props) {
//   const { onClose, footer } = props;

//   return (
//     <HStack justify="stretch" mb=".5rem" spacing={4}>
//       {footer}
//       <Button onClick={onClose}>Close</Button>
//     </HStack>
//   );
// }
