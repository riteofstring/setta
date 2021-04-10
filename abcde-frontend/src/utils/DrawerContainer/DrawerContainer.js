import { createContext, useRef } from "react";
import { useDisclosure } from "@chakra-ui/react";
import DrawerPane from "./DrawerPane";
import DrawerButton from "./DrawerButton";

export const DrawerContext = createContext(null);

export default function DrawerContainer(props) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const btnRef = useRef();
  const { header, body, footer, icon, size, variant, borderRadius } = props;

  return (
    <DrawerContext.Provider
      value={{
        isOpen,
        onOpen,
        onClose,
        header,
        body,
        footer,
        btnRef,
        icon,
        variant,
        size,
        borderRadius,
      }}
    >
      <DrawerButton>{props.children}</DrawerButton>
      <DrawerPane />
    </DrawerContext.Provider>
  );
}
