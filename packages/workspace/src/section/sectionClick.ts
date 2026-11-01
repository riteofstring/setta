import type { MouseEvent as ReactMouseEvent } from "react";
import { applyActiveSectionChange } from "../canvas/activeSectionController.js";
import { getCanvasGesturesStore } from "../canvas/gestureState.js";
import { SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER } from "../interaction.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export function getOnSectionClick(host: WorkspaceHost, sectionId: string) {
  return (event: ReactMouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        `button, [role^="menuitem"], .${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`,
      ) ||
      getCanvasGesturesStore(host).getState().mouseDownDraggingSection
    ) {
      return;
    }
    event.stopPropagation();
    applyActiveSectionChange(host, { interaction: "section-click", sectionId });
  };
}
