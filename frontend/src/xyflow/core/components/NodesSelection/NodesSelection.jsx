/**
 * The nodes selection rectangle gets displayed when a user
 * made a selection with on or several nodes
 */

import cc from "classcat";
import { useActiveSection } from "models/activeSection";
import { useSectionRefs } from "models/sectionRefs";
import React, { useRef } from "react";
import { trueSectionPosition } from "thunks/goToSection";
import { getNodesBounds, useStore } from "xyflow/core";
import useDrag from "xyflow/core/hooks/useDrag";

const selector = (s) => {
  const activeSectionIds = useActiveSection.getState().ids;
  const sections = activeSectionIds.map((sectionId) => {
    const ref = useSectionRefs.getState().selfOnly[sectionId];
    const { clientWidth: width, clientHeight: height } = ref;
    const { x, y } = trueSectionPosition(sectionId);
    return { position: { x, y }, width, height };
  });
  return {
    ...getNodesBounds(sections),
    transformString: `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
    userSelectionActive: s.userSelectionActive,
  };
};

function _NodesSelection({ onSelectionContextMenu, disableKeyboardA11y }) {
  const {
    width,
    height,
    x: left,
    y: top,
    transformString,
    userSelectionActive,
  } = useStore(selector);

  const nodeRef = useRef(null);

  //   useEffect(() => {
  //     if (!disableKeyboardA11y) {
  //       nodeRef.current?.focus({
  //         preventScroll: true,
  //       });
  //     }
  //   }, [disableKeyboardA11y]);

  useDrag({
    nodeRef,
  });

  //   if (userSelectionActive || !width || !height) {
  //     return null;
  //   }
  console.log("NodeSelection");

  return (
    <div
      className={cc([
        "react-flow__nodesselection",
        "react-flow__container",
        "nopan",
      ])}
      style={{
        transform: transformString,
      }}
    >
      <div
        ref={nodeRef}
        className="react-flow__nodesselection-rect"
        // onContextMenu={onContextMenu}
        // tabIndex={disableKeyboardA11y ? undefined : -1}
        // onKeyDown={disableKeyboardA11y ? undefined : onKeyDown}
        style={{
          width,
          height,
          top,
          left,
        }}
      />
    </div>
  );
}

function _NodesSelectionWrapper() {
  const nodesSelectionActive = useStore((s) => s.nodesSelectionActive);
  return nodesSelectionActive && <NodesSelection />;
}

const NodesSelection = React.memo(_NodesSelection);
export const NodesSelectionWrapper = React.memo(_NodesSelectionWrapper);
