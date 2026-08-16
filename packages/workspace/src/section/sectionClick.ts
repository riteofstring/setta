import type { MouseEvent as ReactMouseEvent } from "react";
import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { useCanvasGestures } from "../canvas/gestureState";
import { SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER } from "../interaction";

// Extracted from the reference's `Container/utils.tsx` (minus the app-only draw-area branch).
export function getOnSectionClick(sectionId: string) {
  return (event: ReactMouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        `button, [role="menuitem"], .${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`,
      ) ||
      useCanvasGestures.getState().mouseDownDraggingSection
    ) {
      // if a child button, menu item, or resizable is clicked,
      // or a section resize/drag is in progress,
      // then don't "activate" the section
      return;
    }
    event.stopPropagation(); // to prevent parent section from becoming active
    applyActiveSectionChange({ interaction: "section-click", sectionId });
  };
}
