import { useState } from "react";

export function useContextMenu() {
  const [contextMenuDetails, setContextMenuDetails] = useState({
    isOpen: false,
    x: 0,
    y: 0,
  });

  function openContextMenu(e) {
    e.preventDefault();
    setContextMenuDetails({ isOpen: true, x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenuDetails({ isOpen: false, x: 0, y: 0 });
  }

  return [contextMenuDetails, openContextMenu, closeContextMenu];
}
