import { useDisclosure } from "@chakra-ui/react";
import { createContext, useRef } from "react";

import DrawerButton from "./DrawerButton";
import DrawerPane from "./DrawerPane";

export const DrawerContext = createContext(null);

export default function DrawerContainer(props) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const btnRef = useRef();
  const { header, body, footer, icon, size, variant, borderRadius } = props;

  return (
    <>
      <DrawerButton
        btnRef={btnRef}
        onOpen={onOpen}
        icon={icon}
        variant={variant}
        size={size}
        borderRadius={borderRadius}
      >
        {props.children}
      </DrawerButton>
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
