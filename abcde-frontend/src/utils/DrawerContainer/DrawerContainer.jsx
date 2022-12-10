import { useDisclosure } from "@chakra-ui/react";
import { useRef } from "react";
import Button from "utils/atoms/buttons/Button";

import DrawerPane from "./DrawerPane";

export default function DrawerContainer({
  header,
  body,
  footer,
  icon,
  children,
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const btnRef = useRef();

  return (
    <>
      <Button
        btnRef={btnRef}
        onOpen={onOpen}
        tailwindClasses="rounded-full hover:bg-gray-200 p-2"
      >
        {icon && icon}
        {children}
      </Button>

      <DrawerPane
        isOpen={isOpen}
        onClose={onClose}
        btnRef={btnRef}
        header={header}
        body={body}
        footer={footer}
      />
    </>
  );
}
