import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect } from "react";

import type { WorkflowContextMenuState } from "./workflow-graph-surface-layers";

export function useWorkflowContextMenuClose({
  setWorkflowContextMenu,
  workflowContextMenu,
  workflowMenuRef,
}: {
  setWorkflowContextMenu: Dispatch<SetStateAction<WorkflowContextMenuState | null>>;
  workflowContextMenu: WorkflowContextMenuState | null;
  workflowMenuRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (workflowContextMenu === null) {
      return;
    }

    function closeOnClick(event: MouseEvent) {
      if (!workflowMenuRef.current?.contains(event.target as Node)) {
        setWorkflowContextMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkflowContextMenu(null);
      }
    }

    function closeMenu() {
      setWorkflowContextMenu(null);
    }

    window.addEventListener("click", closeOnClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeOnClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [setWorkflowContextMenu, workflowContextMenu, workflowMenuRef]);
}
