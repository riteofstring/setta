import { shiftTabBackToOverviewListItem } from "components/Panes/Overview/SectionListItems";
import { movePaneToIncludeElement } from "forks/xyflow/core/utils/graph";
import { useRef, type CSSProperties } from "react";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import ViewportWrapper from "./Viewport";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

const ReactFlow = ({ children }) => {
  const { containerRef, onKeyDown, onKeyUp, onFocus } = useTabIntercepter();

  return (
    <div
      style={wrapperStyle}
      className="react-flow setta-light dark:setta-dark"
      data-testid="rf__wrapper"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={onFocus}
      ref={containerRef}
    >
      <FlowRenderer>
        <ViewportWrapper>
          <NodeRenderer />
        </ViewportWrapper>
      </FlowRenderer>
      {children}
    </div>
  );
};

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;

function useTabIntercepter() {
  const containerRef = useRef();
  const isTabPress = useRef(false);

  function onFocus(e) {
    if (!isTabPress.current) {
      return;
    }
    movePaneToIncludeElement(e);
  }

  function onKeyUp() {
    isTabPress.current = false;
  }

  function onKeyDown(e) {
    isTabPress.current = e.key === "Tab";
    if (e.key === "Tab") {
      if (e.shiftKey) {
        if (e.target.id.endsWith("-MenuButtonTrigger")) {
          const sectionId = e.target.id.split("-MenuButtonTrigger")[0];
          shiftTabBackToOverviewListItem(e, sectionId);
        } else if (e.target.id.endsWith("-ContainerCore")) {
          const sectionId = e.target.id.split("-ContainerCore")[0];
          shiftTabBackToOverviewListItem(e, sectionId);
        }
      }

      // let preventedDefault = false;
      // const focusableArray = tabbable(containerRef.current);
      // if (focusableArray.length === 0) {
      //   return;
      // }

      // let nextElement;
      // const currentFocusedElement = document.activeElement;
      // const currentIndex = focusableArray.indexOf(currentFocusedElement);

      // let nextIndex;
      // if (e.shiftKey) {
      //   nextIndex =
      //     currentIndex > 0 ? currentIndex - 1 : focusableArray.length - 1;
      // } else {
      //   nextIndex =
      //     currentIndex < focusableArray.length - 1 ? currentIndex + 1 : 0;
      // }

      // nextElement = focusableArray[nextIndex];
      // if (nextElement.className.includes("react-flow__node")) {
      //   preventedDefault = goToSectionIfNotFullyVisible(
      //     e,
      //     nextElement.dataset.id,
      //   );
      // } else {
      //   for (const [sectionId, ref] of Object.entries(
      //     useSectionRefs.getState().selfOnly,
      //   )) {
      //     if (ref.contains(nextElement)) {
      //       preventedDefault = goToSectionIfNotFullyVisible(e, sectionId);
      //       break;
      //     }
      //   }
      // }

      // if (preventedDefault) {
      //   nextElement.focus({ preventScroll: true });
      // }
    }
  }

  return { containerRef, onKeyDown, onKeyUp, onFocus };
}
