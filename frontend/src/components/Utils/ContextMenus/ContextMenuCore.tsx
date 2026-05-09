import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  autoUpdateGpuFloatingPosition,
  createGpuFloatingVirtualPointReference,
} from "gpuFlow/portals/floatingPosition";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NAVBAR_HEIGHT } from "utils/constants";

export function ContextMenuCore({
  children,
  x,
  y,
  isOpen,
  closeContextMenu,
  onKeyDownCapture,
}) {
  const ref = useOutsideAlerter(isOpen, closeContextMenu);
  const [position, setPosition] = useState({
    top: "-9999px",
    left: "-9999px",
    opacity: 0,
    position: "fixed",
  });
  const contentRef = useRef(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition({
        top: "-9999px",
        left: "-9999px",
        opacity: 0,
        position: "fixed",
      });
      return;
    }
    if (!contentRef.current) {
      return;
    }
    return autoUpdateGpuFloatingPosition({
      boundaryPadding: { bottom: 8, left: 8, right: 8, top: NAVBAR_HEIGHT },
      floating: contentRef.current,
      onPosition: setPosition,
      placement: "right-start",
      reference: createGpuFloatingVirtualPointReference({ x, y }),
    });
  }, [x, y, isOpen]);

  return (
    <DropdownMenu.Root open={isOpen} modal={false}>
      <DropdownMenu.Content
        className="absolute z-10 flex max-h-[40vh] w-[clamp(5rem,_20vw,_10rem)] min-w-32 cursor-pointer flex-col overflow-y-auto rounded-md border border-solid border-setta-500/50 bg-white px-2 pb-2 pt-0 shadow-xl dark:bg-setta-900"
        data-testid="context-menu-core"
        style={{
          left: position.left,
          position: position.position,
          top: position.top,
          opacity: position.opacity,
        }}
        onKeyDownCapture={onKeyDownCapture}
        ref={(element) => {
          // Combine refs
          ref.current = element;
          contentRef.current = element;
        }}
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
