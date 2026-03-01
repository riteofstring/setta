import type { CoordinateExtent, ReactFlowStore } from "../types";
import { ConnectionMode } from "../types";

export const infiniteExtent: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

const initialState: ReactFlowStore = {
  width: 0,
  height: 0,
  transform: [0, 0, 1],
  renderTransform: [0, 0, 1],
  d3Zoom: null,
  d3Selection: null,
  d3ZoomHandler: undefined,
  translateExtent: infiniteExtent,
  nodesSelectionDims: null,
  userSelectionActive: false,
  userSelectionRect: null,
  domNode: null,
  paneDragging: false,
  nodeDragThreshold: 1,
  fitViewOnInit: false,
  fitViewOnInitDone: false,
  fitViewOnInitOptions: undefined,
  multiSelectionActive: false,
  selectionKeyPressed: false,
  zoomActivationKeyPressed: false,
  autoPanOnNodeDrag: true,
  connectionStartHandle: null,
  connectionEndHandle: null,
  connectionPosition: { x: 0, y: 0 },
  connectionStatus: null,
  connectionMode: ConnectionMode.Strict,
  autoPanOnConnect: true,
  connectionRadius: 20,
};

export default initialState;
