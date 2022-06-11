import { useState } from "react";
import { NO_CONTEXT_MENU } from "utils/constants";

function defaultFn(suggested) {
  return suggested;
}

function useContextMenu({
  openFn = defaultFn,
  closeFn = defaultFn,
  initialStateFn = defaultFn,
}) {
  const initialState = { isOpen: false, x: 0, y: 0 };

  const [details, setDetails] = useState(initialStateFn(initialState));

  function open(e, ...otherArgs) {
    if (NO_CONTEXT_MENU) {
      return;
    }
    e.preventDefault();
    setDetails((curr) =>
      openFn({ isOpen: true, x: e.clientX, y: e.clientY }, curr, ...otherArgs)
    );
  }

  function close() {
    console.log("useContextMenu close")
    setDetails((curr) => closeFn(initialState, curr));
  }

  return [details, open, close];
}

function useSelectionContextMenu() {
  function openFn(suggested, curr, nodes, ...otherArgs) {
    return { ...suggested, nodeIds: nodes.map((x) => x.id) };
  }

  function initialStateFn(suggested) {
    return { ...suggested, nodeIds: [] };
  }

  return useContextMenu({ openFn, closeFn: initialStateFn, initialStateFn });
}

export function useAllContextMenus() {
  const [paneDetails, openPane, closePane] = useContextMenu({});

  const [selectionDetails, openSelection, closeSelection] =
    useSelectionContextMenu();

  function closeContextMenus() {
    if (paneDetails.isOpen) {
      closePane();
    }
    if (selectionDetails.isOpen) {
      closeSelection();
    }
  }

  return [
    paneDetails,
    openPane,
    closePane,
    selectionDetails,
    openSelection,
    closeSelection,
    closeContextMenus,
  ];
}
