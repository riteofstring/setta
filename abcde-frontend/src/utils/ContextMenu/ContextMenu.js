import { Menu, MenuButton, MenuList, MenuItem, Portal } from "@chakra-ui/react";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useRef, useEffect } from "react";
import { useReactFlow } from "react-flow-renderer";

export function ContextMenu(props) {
  const { x, y, closeContextMenu, reactFlowRef } = props;
  const { project } = useReactFlow();
  const addSection = useCreateDefaultSectionInfo();
  function onClick() {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();
    const initialPosition = project({
      x: x - reactFlowBounds.left,
      y: y - reactFlowBounds.top,
    });
    addSection({ isTopLevel: true, initialPosition });
    closeContextMenu();
  }
  return (
    <ContextMenuCore {...props}>
      <MenuList>
        <MenuItem onClick={onClick}>New Section</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}

function ContextMenuCore({ children, x, y, isOpen, closeContextMenu }) {
  const ref = useRef(null);
  useOutsideAlerter(ref, isOpen, closeContextMenu);

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
function useOutsideAlerter(ref, isOpen, closeContextMenu) {
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
}
