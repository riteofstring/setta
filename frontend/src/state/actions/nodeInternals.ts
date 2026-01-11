import { useReactFlow } from "forks/xyflow/core/store";
import { fitView } from "forks/xyflow/core/store/utils";
import { Node, NodeDragItem } from "forks/xyflow/core/types";
import { getDimensions } from "forks/xyflow/core/utils";
import _ from "lodash";
import {
  useMisc,
  useNodeInternals,
  useProjectState,
  useSectionRefs,
  ZustandNodeInternalsState,
} from "state/definitions";
import { Position } from "utils/generatedTypes";
import { scheduleEdgeHandlePositionUpdate } from "./edgeHandles";
import {
  debounced_route_set_top_level_section_layout,
  getSectionDescendants,
} from "./sectionInfos";

type NodeDimensionsUpdate = Array<{
  id: string;
  nodeElement: HTMLDivElement;
  forceUpdate: boolean;
}>;

export function getNodes(s: null | ZustandNodeInternalsState = null) {
  const source = s ? s.x : useNodeInternals.getState().x;
  return Array.from(source.values());
}

export function addNodes(nodes: Array<Node>) {
  const newNodes = getNewNodes();
  for (const n of nodes) {
    newNodes.set(n.id, n);
  }
  useNodeInternals.setState({ x: newNodes });
}

export function deleteNodes(nodeIds: Array<string>) {
  const newNodes = getNewNodes();
  for (const n of nodeIds) {
    newNodes.delete(n);
  }
  useNodeInternals.setState({ x: newNodes });
}

export function updateNodeDimensions(updates: NodeDimensionsUpdate) {
  const { fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions, domNode } =
    useReactFlow.getState();

  const viewportNode = domNode?.querySelector(".react-flow__viewport");

  if (!viewportNode) {
    return;
  }

  const newNodes = getNewNodes();
  let prevWidthHeightWasNull = false;

  for (const u of updates) {
    const node = newNodes.get(u.id);
    if (node) {
      const dimensions = getDimensions(u.nodeElement);
      const doUpdate = !!(
        dimensions.width &&
        dimensions.height &&
        (node.width !== dimensions.width ||
          node.height !== dimensions.height ||
          u.forceUpdate)
      );

      if (doUpdate) {
        if (node.width === null || node.height === null) {
          prevWidthHeightWasNull = true;
        }
        newNodes.set(node.id, {
          ...node,
          ...dimensions,
        });
      }
    }
  }

  useNodeInternals.setState({ x: newNodes });
  debounced_route_set_top_level_section_layout();

  const miscState = useMisc.getState();
  // don't do fitView until all code areas are done rendering
  if (miscState.numInitializedCodeAreas !== miscState.numDisplayedCodeAreas) {
    return;
  }

  const nextFitViewOnInitDone =
    fitViewOnInitDone ||
    (fitViewOnInit &&
      !fitViewOnInitDone &&
      fitView({
        initial: true,
        ...fitViewOnInitOptions,
      }));

  useReactFlow.setState({ fitViewOnInitDone: nextFitViewOnInitDone });
}

export function updateNodePositions(nodeDragItems: Array<NodeDragItem>) {
  const newNodes = getNewNodes();
  for (const n of nodeDragItems) {
    newNodes.get(n.id).position = n.position;
  }
  useNodeInternals.setState({ x: newNodes });
  const sectionIds = new Set<string>();
  const projectState = useProjectState.getState();
  for (const item of nodeDragItems) {
    const descendants = getSectionDescendants(item.id, projectState);
    for (const id of descendants) {
      sectionIds.add(id);
    }
  }
  scheduleEdgeHandlePositionUpdate(Array.from(sectionIds));
}

export function raiseTempZIndex(nodes: Array<Node>) {
  const newNodes = getNewNodes();
  for (const [, n] of newNodes) {
    n.tempZIndex = n.zIndex;
  }
  for (const n of nodes) {
    newNodes.get(n.id).tempZIndex = newNodes.get(n.id).zIndex + 1000;
  }
  useNodeInternals.setState({ x: newNodes });
}

export function justMoveANode(id: string, position: Position) {
  const newNodes = getNewNodes();
  newNodes.get(id).position = position;
  useNodeInternals.setState({ x: newNodes });
  const projectState = useProjectState.getState();
  const sectionIds = getSectionDescendants(id, projectState);
  scheduleEdgeHandlePositionUpdate(sectionIds);
}

function getNewNodes() {
  return _.cloneDeep(useNodeInternals.getState().x);
}

export function getNodeUpdateInformation(entries, fromResizeObserver: boolean) {
  if (fromResizeObserver) {
    return entries.map((entry) => ({
      id: entry.target.getAttribute("data-id"),
      nodeElement: entry.target,
      forceUpdate: true,
    }));
  }
  const output: NodeDimensionsUpdate = [];
  const refState = useSectionRefs.getState().withNested;
  entries.forEach((nodeId) => {
    if (refState[nodeId]) {
      output.push({
        id: nodeId,
        nodeElement: refState[nodeId],
        forceUpdate: true,
      });
    }
  });
  return output;
}
