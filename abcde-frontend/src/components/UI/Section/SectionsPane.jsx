import { useGroupSectionsOnKeyActivation } from "hooks/useGroupSectionsOnKeyActivation";
import { useSectionRefAndInit } from "hooks/useStateRef";
import { useActiveSection } from "models/activeSection";
import React from "react";
import ReactFlow, { Background, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import colors from "tailwindcss/colors";
import {
  setPositionAndZIndices,
  setZIndices,
} from "thunks/sections/sectionPositions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { PANEID } from "utils/constants";
import { NodeContextMenu } from "utils/ContextMenus/NodeContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { useAllContextMenus } from "utils/ContextMenus/useContextMenu";
import "./react-flow-css.css";
import { ResponsiveControls } from "./ResponsiveControls";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };
const reactFlowStyle = {
  background: "#94a3b8",
  height: "100%",
};

function _SectionsPane({ initialNodes }) {
  const reactFlowRef = useSectionRefAndInit(PANEID);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const setActiveSection = useActiveSection((x) => x.setId);
  useGroupSectionsOnKeyActivation();

  useDeepCompareEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  const [
    paneCtxMenuDetails,
    openPaneCtxMenu,
    closePaneCtxMenu,
    selectionCtxMenuDetails,
    openSelectionCtxMenu,
    closeSelectionCtxMenu,
    nodeCtxMenuDetails,
    openNodeCtxMenu,
    closeNodeCtxMenu,
    closeCtxMenus,
  ] = useAllContextMenus();

  function onPaneClick() {
    closeCtxMenus();
    setActiveSection(null);
  }

  function onNodeDragStop(e, node) {
    setPositionAndZIndices([node]);
  }

  function onSelectionDragStop(e, nodes) {
    setPositionAndZIndices(nodes);
  }

  function onNodeDragStart(e, node) {
    setZIndices([node]);
  }

  return (
    <ReactFlow
      ref={reactFlowRef}
      nodes={nodes}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      style={reactFlowStyle}
      // snapGrid={[32, 32]}
      // snapToGrid={true}
      onNodeDragStart={onNodeDragStart}
      onPaneContextMenu={openPaneCtxMenu}
      onSelectionContextMenu={openSelectionCtxMenu}
      onNodeContextMenu={openNodeCtxMenu}
      onPaneClick={onPaneClick}
      onMoveStart={closeCtxMenus}
      onNodeDragStop={onNodeDragStop}
      onSelectionDragStop={onSelectionDragStop}
    >
      <PaneContextMenu
        {...paneCtxMenuDetails}
        closeContextMenu={closePaneCtxMenu}
      />
      <SelectionContextMenu
        {...selectionCtxMenuDetails}
        closeContextMenu={closeSelectionCtxMenu}
      />
      {nodeCtxMenuDetails.nodeId && (
        <NodeContextMenu
          {...nodeCtxMenuDetails}
          closeContextMenu={closeNodeCtxMenu}
        />
      )}
      <ResponsiveMiniMap />
      <ResponsiveControls />
      <Background color={colors.slate[300]} size={0.75} gap={16} />
    </ReactFlow>
  );
}

export const SectionsPane = React.memo(_SectionsPane);
