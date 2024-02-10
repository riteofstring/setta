import cc from "classcat";
import _ from "lodash";
import { useContextMenus } from "models/contextMenus";
import React, { useRef } from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import { useStore } from "xyflow/core";
import useDrag from "xyflow/core/hooks/useDrag";

function _NodesSelection({ x, y, width, height }) {
  const transformString = useStore(
    (s) =>
      `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
  );
  const nodeRef = useRef(null);

  const onContextMenu = (event) => {
    const selectedNodeIds = REACT_FLOW_STORE.store
      .getState()
      .getNodes()
      .filter((n) => n.selected)
      .map((n) => n.id);
    useContextMenus.getState().openSelection(event, selectedNodeIds);
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
  const nodesSelectionDims = useStore((s) => s.nodesSelectionDims, _.isEqual);
  return nodesSelectionDims && <NodesSelection {...nodesSelectionDims} />;
}
const NodesSelection = React.memo(_NodesSelection);
export const NodesSelectionWrapper = React.memo(_NodesSelectionWrapper);
