import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef } from "react";

export function ContextMenuCore({ children, x, y, isOpen, closeContextMenu }) {
  const ref = useOutsideAlerter(isOpen, closeContextMenu);

  return (
    <div ref={ref}>
      <DropdownMenu.Root open={isOpen} modal={false}>
        <DropdownMenu.Content
          style={{
            position: "absolute",
            left: x,
            top: y,
            cursor: "default",
            zIndex: 10,
          }}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
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
