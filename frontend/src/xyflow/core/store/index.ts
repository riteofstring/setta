import { zoomIdentity } from "d3-zoom";
import { createWithEqualityFn } from "zustand/traditional";

import type {
  CoordinateExtent,
  Node,
  NodeChange,
  NodeDimensionChange,
  NodeDimensionUpdate,
  NodeDragItem,
  NodePositionChange,
  NodeSelectionChange,
  ReactFlowState,
  UnselectNodesAndEdgesParams,
  XYPosition,
} from "../types";
import { getDimensions } from "../utils";
import { createSelectionChange, getSelectionChanges } from "../utils/changes";
import initialState from "./initialState";
import {
  createNodeInternals,
  fitView,
  updateNodesAndEdgesSelections,
} from "./utils";

const createRFStore = () =>
  createWithEqualityFn<ReactFlowState>(
    (set, get) => ({
      ...initialState,
      setNodes: (nodes: Node[]) => {
        const { nodeInternals } = get();
        set({
          nodeInternals: createNodeInternals(nodes, nodeInternals),
        });
      },
      getNodes: () => {
        return Array.from(get().nodeInternals.values());
      },
      updateNodeDimensions: (updates: NodeDimensionUpdate[]) => {
        const {
          onNodesChange,
          nodeInternals,
          fitViewOnInit,
          fitViewOnInitDone,
          fitViewOnInitOptions,
          domNode,
        } = get();
        const viewportNode = domNode?.querySelector(".react-flow__viewport");

        if (!viewportNode) {
          return;
        }

        const changes: NodeDimensionChange[] = updates.reduce<
          NodeDimensionChange[]
        >((res, update) => {
          const node = nodeInternals.get(update.id);

          if (node) {
            const dimensions = getDimensions(update.nodeElement);
            const doUpdate = !!(
              dimensions.width &&
              dimensions.height &&
              (node.width !== dimensions.width ||
                node.height !== dimensions.height ||
                update.forceUpdate)
            );

            if (doUpdate) {
              nodeInternals.set(node.id, {
                ...node,
                ...dimensions,
              });

              res.push({
                id: node.id,
                type: "dimensions",
                dimensions,
              });
            }
          }

          return res;
        }, []);

        const nextFitViewOnInitDone =
          fitViewOnInitDone ||
          (fitViewOnInit &&
            !fitViewOnInitDone &&
            fitView(get, { initial: true, ...fitViewOnInitOptions }));
        set({
          nodeInternals: new Map(nodeInternals),
          fitViewOnInitDone: nextFitViewOnInitDone,
        });

        if (changes?.length > 0) {
          onNodesChange(changes);
        }
      },
      updateNodePositions: (
        nodeDragItems: NodeDragItem[] | Node[],
        positionChanged = true,
        dragging = false,
      ) => {
        const { triggerNodeChanges } = get();

        const changes = nodeDragItems.map((node) => {
          const change: NodePositionChange = {
            id: node.id,
            type: "position",
            dragging,
          };

          if (positionChanged) {
            change.position = node.position;
          }

          return change;
        });

        triggerNodeChanges(changes);
      },

      triggerNodeChanges: (changes: NodeChange[]) => {
        const { onNodesChange } = get();

        if (changes?.length) {
          onNodesChange(changes);
        }
      },
      onNodesChange: (changes: NodeChange[]) => {
        const { nodeInternals } = get();
        const newNodes = new Map(nodeInternals);
        for (const c of changes) {
          switch (c.type) {
            case "select": {
              newNodes.get(c.id).selected = c.selected;
              break;
            }
            case "position": {
              if (typeof c.position !== "undefined") {
                newNodes.get(c.id).position = c.position;
              }
              break;
            }
            case "add": {
              newNodes.set(c.item.id, c.item);
              break;
            }
            case "remove": {
              newNodes.delete(c.id);
              break;
            }
          }
        }
        set({ nodeInternals: newNodes });
      },

      addSelectedNodes: (selectedNodeIds: string[]) => {
        const { multiSelectionActive, getNodes } = get();
        let changedNodes: NodeSelectionChange[];

        if (multiSelectionActive) {
          changedNodes = selectedNodeIds.map((nodeId) =>
            createSelectionChange(nodeId, true),
          ) as NodeSelectionChange[];
        } else {
          changedNodes = getSelectionChanges(getNodes(), selectedNodeIds);
        }

        updateNodesAndEdgesSelections({
          changedNodes,
          get,
          set,
        });
      },
      unselectNodesAndEdges: ({ nodes }: UnselectNodesAndEdgesParams = {}) => {
        const { getNodes } = get();
        const nodesToUnselect = nodes ? nodes : getNodes();

        const changedNodes = nodesToUnselect.map((n) => {
          n.selected = false;
          return createSelectionChange(n.id, false);
        }) as NodeSelectionChange[];

        updateNodesAndEdgesSelections({
          changedNodes,
          get,
          set,
        });
      },
      setMinZoom: (minZoom: number) => {
        const { d3Zoom, maxZoom } = get();
        d3Zoom?.scaleExtent([minZoom, maxZoom]);

        set({ minZoom });
      },
      setMaxZoom: (maxZoom: number) => {
        const { d3Zoom, minZoom } = get();
        d3Zoom?.scaleExtent([minZoom, maxZoom]);

        set({ maxZoom });
      },
      setTranslateExtent: (translateExtent: CoordinateExtent) => {
        get().d3Zoom?.translateExtent(translateExtent);

        set({ translateExtent });
      },
      resetSelectedElements: () => {
        const { getNodes } = get();
        const nodes = getNodes();

        const nodesToUnselect = nodes
          .filter((e) => e.selected)
          .map((n) =>
            createSelectionChange(n.id, false),
          ) as NodeSelectionChange[];

        updateNodesAndEdgesSelections({
          changedNodes: nodesToUnselect,
          get,
          set,
        });
      },
      panBy: (delta: XYPosition): boolean => {
        const {
          transform,
          width,
          height,
          d3Zoom,
          d3Selection,
          translateExtent,
        } = get();

        if (!d3Zoom || !d3Selection || (!delta.x && !delta.y)) {
          return false;
        }

        const nextTransform = zoomIdentity
          .translate(transform[0] + delta.x, transform[1] + delta.y)
          .scale(transform[2]);

        const extent: CoordinateExtent = [
          [0, 0],
          [width, height],
        ];

        const constrainedTransform = d3Zoom?.constrain()(
          nextTransform,
          extent,
          translateExtent,
        );
        d3Zoom.transform(d3Selection, constrainedTransform);

        const transformChanged =
          transform[0] !== constrainedTransform.x ||
          transform[1] !== constrainedTransform.y ||
          transform[2] !== constrainedTransform.k;

        return transformChanged;
      },
      reset: () => set({ ...initialState }),
    }),
    Object.is,
  );

export { createRFStore };
