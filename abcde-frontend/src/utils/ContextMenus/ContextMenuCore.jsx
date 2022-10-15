import { Menu, MenuButton, Portal } from "@chakra-ui/react";
import { useEffect, useRef } from "react";

export function ContextMenuCore({ children, x, y, isOpen, closeContextMenu }) {
  const ref = useOutsideAlerter(isOpen, closeContextMenu);

  return (
    <Portal>
      <div ref={ref}>
        <Menu isOpen={isOpen} gutter={0}>
          <MenuButton
            aria-hidden={true}
            w={1}
            h={1}
            style={{
              position: "absolute",
              left: x,
              top: y,
              cursor: "default",
            }}
          />
          {children}
        </Menu>
      </div>
    </Portal>
  );
}

// https://stackoverflow.com/a/42234988
function useOutsideAlerter(isOpen, closeContextMenu) {
  const ref = useRef(null);
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target) && isOpen) {
        closeContextMenu();
      }
    }
    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, isOpen]);
  return ref;
}
