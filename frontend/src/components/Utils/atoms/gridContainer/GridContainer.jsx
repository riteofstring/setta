import { isSectionFullyVisible } from "forks/xyflow/core/utils/graph";
import React, { useRef } from "react";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useSectionRefs } from "state/definitions";
import { tabbable } from "tabbable";

export const GridContainer = React.forwardRef(
  ({ children, overflow = "overflow-hidden", ...props }, ref) => {
    return (
      <section
        className={`grid h-full w-screen grid-cols-[1fr] grid-rows-[min-content] ${overflow}`}
        ref={ref}
        {...props}
      >
        {children}
      </section>
    );
  },
);

export function ProjectGridContainer({ children }) {
  const { containerRef, onKeyDown } = useTabIntercepter();
  return (
    <GridContainer ref={containerRef} onKeyDown={onKeyDown}>
      {children}
    </GridContainer>
  );
}

function useTabIntercepter() {
  const containerRef = useRef();

  function onKeyDown(e) {
    if (e.key === "Tab") {
      let preventedDefault = false;
      const focusableArray = tabbable(containerRef.current);
      if (focusableArray.length === 0) {
        return;
      }

      let nextElement;
      const currentFocusedElement = document.activeElement;
      const currentIndex = focusableArray.indexOf(currentFocusedElement);

      let nextIndex;
      if (e.shiftKey) {
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : focusableArray.length - 1;
      } else {
        nextIndex =
          currentIndex < focusableArray.length - 1 ? currentIndex + 1 : 0;
      }

      nextElement = focusableArray[nextIndex];
      if (nextElement.className.includes("react-flow__node")) {
        preventedDefault = goToSectionIfNotFullyVisible(
          e,
          nextElement.dataset.id,
        );
      } else {
        for (const [sectionId, ref] of Object.entries(
          useSectionRefs.getState().selfOnly,
        )) {
          if (ref.contains(nextElement)) {
            preventedDefault = goToSectionIfNotFullyVisible(e, sectionId);
            break;
          }
        }
      }

      if (preventedDefault) {
        nextElement.focus({ preventScroll: true });
      }
    }
  }

  return { containerRef, onKeyDown };
}

function goToSectionIfNotFullyVisible(e, sectionId) {
  if (!isSectionFullyVisible(sectionId)) {
    e.preventDefault();
    goToSection(sectionId, 0);
    return true;
  }
  return false;
}
