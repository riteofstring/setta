import type { CoordinateExtent, ReactFlowStore } from "../types";
import { devWarn } from "../utils";

export const infiniteExtent: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

const initialState: ReactFlowStore = {
  width: 0,
  height: 0,
  transform: [0, 0, 1],
  nodeInternals: new Map(),
  onNodesChange: null,
  hasDefaultNodes: false,
  d3Zoom: null,
  d3Selection: null,
  d3ZoomHandler: undefined,
  minZoom: 0.5,
  maxZoom: 2,
  translateExtent: infiniteExtent,
  nodeExtent: infiniteExtent,
  nodesSelectionActive: false,
  userSelectionActive: false,
  userSelectionRect: null,
  domNode: null,
  paneDragging: false,
  noPanClassName: "nopan",
  nodeOrigin: [0, 0],
  nodeDragThreshold: 0,

  snapGrid: [15, 15],
  snapToGrid: false,

  nodesDraggable: true,
  nodesFocusable: true,
  elementsSelectable: true,
  fitViewOnInit: false,
  fitViewOnInitDone: false,
  fitViewOnInitOptions: undefined,
  onSelectionChange: [],

  multiSelectionActive: false,

  ariaLiveMessage: "",
  autoPanOnNodeDrag: true,
  onError: devWarn,
};

export default initialState;
