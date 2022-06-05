import { useState } from "react";
import { NO_CONTEXT_MENU } from "utils/constants";

export function useContextMenu() {
  const [contextMenuDetails, setContextMenuDetails] = useState({
    isOpen: false,
    x: 0,
    y: 0,
  });

  function openContextMenu(e) {
    if (NO_CONTEXT_MENU) {
      return;
    }
    e.preventDefault();
    setContextMenuDetails({ isOpen: true, x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenuDetails({ isOpen: false, x: 0, y: 0 });
  }

  return [contextMenuDetails, openContextMenu, closeContextMenu];
}
