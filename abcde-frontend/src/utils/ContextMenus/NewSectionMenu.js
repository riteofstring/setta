import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useRef, useEffect, useState } from "react";
import { Menu, Item, useContextMenu } from "react-contexify";
import { createPortal } from "react-dom";
import { useReactFlow } from "react-flow-renderer";

// https://reactflow.dev/examples/drag-and-drop/
export function NewSectionMenu({ divRef }) {
  const addSection = useCreateDefaultSectionInfo();
  const { project } = useReactFlow();

  function newSectionClick({ triggerEvent: event }) {
    const bounds = divRef.current.getBoundingClientRect();
    const initialPosition = project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    addSection({ isTopLevel: true, initialPosition });
  }

  return (
    <Menu id="NewSectionMenu">
      <Item onClick={newSectionClick}>New Section 1</Item>
      <Item onClick={newSectionClick}>New Section 2</Item>
      <Item onClick={newSectionClick}>New Section 3</Item>
      <Item onClick={newSectionClick}>New Section 4</Item>
      <Item onClick={newSectionClick}>New Section 5</Item>
    </Menu>
  );
}

export function useNewSectionMenu() {
  const { show } = useContextMenu({ id: "NewSectionMenu" });
  return (e) => {
    console.log("e", e);
    e.preventDefault();
    // show(e, {
    //   position: {
    //     x: 100,
    //     y: 1000,
    //   },
    // });
    show(e);
  };
}

// https://stackoverflow.com/a/69361050
export function PortalWrapper({ children, selector }) {
  const ref = useRef();
  const [mount, setMount] = useState(false);

  useEffect(() => {
    ref.current = document.querySelector(selector);
    setMount(true);
  }, [selector]);

  console.log("mount", mount);

  return mount ? createPortal(children, ref.current) : null;
}
