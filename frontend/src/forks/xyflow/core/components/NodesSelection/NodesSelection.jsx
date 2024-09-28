import cc from "classcat";
import useDrag from "forks/xyflow/core/hooks/useDrag";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React, { useRef } from "react";
import { openSelectionContextMenu } from "state/actions/contextMenus";
import { getNodes } from "state/actions/nodeInternals";

function _NodesSelection({ x, y, width, height }) {
  const transformString = useReactFlow(
    (s) =>
      `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
  );
  const nodeRef = useRef(null);

  const onContextMenu = (event) => {
    const selectedNodeIds = getNodes()
      .filter((n) => n.selected)
      .map((n) => n.id);
    openSelectionContextMenu(event, selectedNodeIds);
  };

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
        onContextMenu={onContextMenu}
        // tabIndex={disableKeyboardA11y ? undefined : -1}
        // onKeyDown={disableKeyboardA11y ? undefined : onKeyDown}
        style={{
          width,
          height,
          top: y,
          left: x,
        }}
      />
    </div>
  );
}

function _NodesSelectionWrapper() {
  const nodesSelectionDims = useReactFlow(
    (s) => s.nodesSelectionDims,
    _.isEqual,
  );
  return nodesSelectionDims && <NodesSelection {...nodesSelectionDims} />;
}
const NodesSelection = React.memo(_NodesSelection);
export const NodesSelectionWrapper = React.memo(_NodesSelectionWrapper);
