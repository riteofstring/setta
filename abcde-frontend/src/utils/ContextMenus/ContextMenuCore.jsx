import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef } from "react";

export function ContextMenuCore({ children, x, y, isOpen, closeContextMenu }) {
  const ref = useOutsideAlerter(isOpen, closeContextMenu);

  return (
    <div ref={ref}>
      <DropdownMenu.Root open={isOpen} modal={false}>
        <DropdownMenu.Content
          className="flex flex-col gap-1 z-10 absolute bg-white px-2 py-2 rounded-md shadow-xl cursor-pointer w-[clamp(5rem,_20vw,_10rem)]"
          style={{
            left: x,
            top: y,
          }}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
}

export function ContextMenuItem({ onClick, children }) {
  return (
    <DropdownMenu.Item
      className="hover:bg-gray-100 py-1 px-2 rounded-md font-body text-xs font-bold gray-700"
      onClick={onClick}
    >
      {children}
    </DropdownMenu.Item>
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
