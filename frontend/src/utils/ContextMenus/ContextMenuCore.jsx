import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef } from "react";

export function ContextMenuCore({ children, x, y, isOpen, closeContextMenu }) {
  const ref = useOutsideAlerter(isOpen, closeContextMenu);

  return (
    <DropdownMenu.Root open={isOpen} modal={false}>
      <DropdownMenu.Content
        className="absolute z-10 flex w-[clamp(5rem,_20vw,_10rem)] cursor-pointer flex-col gap-1 rounded-md bg-white px-2 py-2 shadow-xl dark:bg-setta-800"
        style={{
          left: x,
          top: y,
        }}
        ref={ref}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
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
