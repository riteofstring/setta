import { useContext } from "react";
import { DrawerContext } from "./DrawerContainer";
import { Button, IconButton } from "@chakra-ui/react";

export default function DrawerButton(props) {
  const {
    btnRef,
    onOpen,
    icon = false,
    variant = "auto",
    size = "sm",
    borderRadius = "auto",
  } = useContext(DrawerContext);

  return (
    <>
      {icon ? (
        <IconButton
          borderRadius={borderRadius}
          icon={icon}
          size={size}
          variant={variant}
          ref={btnRef}
          onClick={onOpen}
        />
      ) : (
        <Button
          ref={btnRef}
          onClick={onOpen}
          size={size}
          variant={variant}
          borderRadius={borderRadius}
        >
          {props.children}
        </Button>
      )}
    </>
  );
}
