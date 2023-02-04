import _ from "lodash";
import { useSectionRefs } from "models/sectionRefs";
import React, { useEffect, useRef } from "react";
import ReactFlow, { Background, useNodesState } from "react-flow-renderer";
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

function setInitialToCurrent(initialNodes, nodes) {
  let newNodeStates = _.cloneDeep(initialNodes);
  for (let n of newNodeStates) {
    for (let m of nodes) {
      if (n.id === m.id) {
        // Use position as set by react flow, instead of initialPosition
        n.position = m.position;
        break;
      }
    }
  }
  return newNodeStates;
}

function _SectionsPane({ initialNodes }) {
  const reactFlowRef = useRef(PANEID);
  const setSectionRef = useSectionRefs((x) => x.setRef);
  useEffect(() => {
    setSectionRef({ sectionId: PANEID, ref: reactFlowRef.current });
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  useDeepCompareEffect(() => {
    if (!_.isEqual(_.map(nodes, "id"), _.map(initialNodes, "id"))) {
      const newNodeStates = setInitialToCurrent(initialNodes, nodes);
      setNodes(newNodeStates);
    }
  }, [initialNodes]);

  const reactFlowStyle = {
    background: "#CBD5E0",
    height: "100%",
  };

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
      onPaneContextMenu={openPaneCtxMenu}
      onSelectionContextMenu={openSelectionCtxMenu}
      onNodeContextMenu={openNodeCtxMenu}
      onPaneClick={closeCtxMenus}
      onMoveStart={closeCtxMenus}
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
      <Background color="#b3bfd1" size={0.75} gap={16} />
    </ReactFlow>
  );
}

export const SectionsPane = React.memo(_SectionsPane);
