import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import { useEdgeHandleRegistry } from "state/stores/authoringStores";
import { useReactFlow } from "../store";
import type { ReactFlowState } from "../types";
import { HandlePosition } from "../types";
import { getBezierPath } from "./Edges/BezierEdge";

const oppositePosition = {
  [HandlePosition.Left]: HandlePosition.Right,
  [HandlePosition.Right]: HandlePosition.Left,
  [HandlePosition.Top]: HandlePosition.Bottom,
  [HandlePosition.Bottom]: HandlePosition.Top,
};

const selector = (state: ReactFlowState) => ({
  connectionStartHandle: state.connectionStartHandle,
  connectionPosition: state.connectionPosition,
  connectionStatus: state.connectionStatus,
  transform: state.transform,
  width: state.width,
  height: state.height,
});

export function ConnectionLine() {
  const {
    connectionStartHandle,
    connectionPosition,
    connectionStatus,
    transform,
    width,
    height,
  } = useReactFlow(selector);
  const positions = useEdgeHandleRegistry((state) => state.positions);

  if (!connectionStartHandle || !width || !height) {
    return null;
  }

  const startHandleId = connectionStartHandle.handleId;
  if (!startHandleId) {
    return null;
  }

  const startKey = makeEdgeHandleKey(
    connectionStartHandle.sectionId,
    startHandleId,
    connectionStartHandle.type,
  );
  const start = positions[startKey];
  if (!start) {
    return null;
  }

  const toX = (connectionPosition.x - transform[0]) / transform[2];
  const toY = (connectionPosition.y - transform[1]) / transform[2];
  const sourcePosition = start.side;
  const targetPosition = oppositePosition[sourcePosition];

  const [path] = getBezierPath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition,
    targetX: toX,
    targetY: toY,
    targetPosition,
  });

  const connectionClassName = ["react-flow__connection", connectionStatus]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="react-flow__edges react-flow__connectionline react-flow__container"
    >
      <g className={connectionClassName}>
        <path d={path} fill="none" className="react-flow__connection-path" />
      </g>
    </svg>
  );
}
