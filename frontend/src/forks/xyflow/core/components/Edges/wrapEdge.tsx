import type { ComponentType, MouseEvent as ReactMouseEvent } from "react";
import { memo, useRef, useState } from "react";

import { toggleEdgeSelection } from "state/actions/edges";
import { useReactFlow } from "../../store";
import type { Connection, HandleType, WrapEdgeProps } from "../../types";
import { handlePointerDown } from "../Handle/handler";
import { EdgeAnchor } from "./EdgeAnchor";

const alwaysValidConnection = () => true;
type EdgeReconnectEndpoint = "source" | "target";

type EdgeWrapperClassNameOptions = Pick<
  WrapEdgeProps,
  "animated" | "className" | "selected" | "type"
> & {
  inactive: boolean;
  updateHover: boolean;
};

type EdgeShapeProps = Pick<
  WrapEdgeProps,
  | "animated"
  | "className"
  | "data"
  | "id"
  | "interactionWidth"
  | "label"
  | "labelBgBorderRadius"
  | "labelBgPadding"
  | "labelBgStyle"
  | "labelShowBg"
  | "labelStyle"
  | "markerEnd"
  | "markerStart"
  | "selected"
  | "source"
  | "sourceHandleId"
  | "sourcePosition"
  | "sourceX"
  | "sourceY"
  | "style"
  | "target"
  | "targetHandleId"
  | "targetPosition"
  | "targetX"
  | "targetY"
  | "type"
> & {
  EdgeComponent: ComponentType<WrapEdgeProps>;
  updating: boolean;
};

type ReconnectAnchorsProps = Pick<
  WrapEdgeProps,
  | "reconnectRadius"
  | "sourcePosition"
  | "sourceX"
  | "sourceY"
  | "targetPosition"
  | "targetX"
  | "targetY"
> & {
  isReconnectable: boolean;
  onEdgeUpdaterMouseEnter: (
    event: ReactMouseEvent<SVGGElement, MouseEvent>,
  ) => void;
  onEdgeUpdaterMouseOut: (
    event: ReactMouseEvent<SVGGElement, MouseEvent>,
  ) => void;
  onEdgeUpdaterSourceMouseDown: (
    event: ReactMouseEvent<SVGGElement, MouseEvent>,
  ) => void;
  onEdgeUpdaterTargetMouseDown: (
    event: ReactMouseEvent<SVGGElement, MouseEvent>,
  ) => void;
};

function getEdgeWrapperClassName({
  animated,
  className,
  inactive,
  selected,
  type,
  updateHover,
}: EdgeWrapperClassNameOptions): string {
  const classNames = ["react-flow__edge"];

  if (type) {
    classNames.push(`react-flow__edge-${type}`);
  }
  if (className) {
    classNames.push(className);
  }
  if (selected) {
    classNames.push("selected");
  }
  if (animated) {
    classNames.push("animated");
  }
  if (inactive) {
    classNames.push("inactive");
  }
  if (updateHover) {
    classNames.push("updating");
  }

  return classNames.join(" ");
}

function EdgeShape({
  EdgeComponent,
  updating,
  ...edgeProps
}: EdgeShapeProps): JSX.Element | null {
  if (updating) {
    return null;
  }

  return <EdgeComponent {...edgeProps} />;
}

function ReconnectAnchors({
  isReconnectable,
  reconnectRadius = 10,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
  onEdgeUpdaterMouseEnter,
  onEdgeUpdaterMouseOut,
  onEdgeUpdaterSourceMouseDown,
  onEdgeUpdaterTargetMouseDown,
}: ReconnectAnchorsProps): JSX.Element | null {
  if (!isReconnectable) {
    return null;
  }

  return (
    <>
      <EdgeAnchor
        position={sourcePosition}
        centerX={sourceX}
        centerY={sourceY}
        radius={reconnectRadius}
        onMouseDown={onEdgeUpdaterSourceMouseDown}
        onMouseEnter={onEdgeUpdaterMouseEnter}
        onMouseOut={onEdgeUpdaterMouseOut}
        type="source"
      />
      <EdgeAnchor
        position={targetPosition}
        centerX={targetX}
        centerY={targetY}
        radius={reconnectRadius}
        onMouseDown={onEdgeUpdaterTargetMouseDown}
        onMouseEnter={onEdgeUpdaterMouseEnter}
        onMouseOut={onEdgeUpdaterMouseOut}
        type="target"
      />
    </>
  );
}

function onEdgeClick({
  elementsSelectable,
  event,
  id,
}: {
  elementsSelectable: boolean;
  event: ReactMouseEvent<SVGGElement, MouseEvent>;
  id: string;
}) {
  if (!elementsSelectable) {
    return;
  }

  event.stopPropagation();
  toggleEdgeSelection(id, useReactFlow.getState().multiSelectionActive);
}

function getReconnectTarget({
  endpoint,
  source,
  sourceHandleId,
  target,
  targetHandleId,
}: {
  endpoint: EdgeReconnectEndpoint;
  source: string;
  sourceHandleId?: string | null;
  target: string;
  targetHandleId?: string | null;
}): {
  handleId: string | null;
  handleType: HandleType;
  isTarget: boolean;
  nodeId: string;
} {
  if (endpoint === "source") {
    return {
      nodeId: target,
      handleId: targetHandleId ?? null,
      handleType: "target",
      isTarget: true,
    };
  }

  return {
    nodeId: source,
    handleId: sourceHandleId ?? null,
    handleType: "source",
    isTarget: false,
  };
}

function startEdgeReconnect({
  endpoint,
  event,
  onReconnect,
  setUpdating,
  source,
  sourceHandleId,
  target,
  targetHandleId,
}: {
  endpoint: EdgeReconnectEndpoint;
  event: ReactMouseEvent<SVGGElement, MouseEvent>;
  onReconnect?: (connection: Connection) => void;
  setUpdating: (updating: boolean) => void;
  source: string;
  sourceHandleId?: string | null;
  target: string;
  targetHandleId?: string | null;
}) {
  if (event.button !== 0 || !onReconnect) {
    return;
  }

  const { handleId, handleType, isTarget, nodeId } = getReconnectTarget({
    endpoint,
    source,
    sourceHandleId,
    target,
    targetHandleId,
  });

  setUpdating(true);

  handlePointerDown({
    event,
    handleId,
    nodeId,
    onConnect: onReconnect,
    isTarget,
    getState: useReactFlow.getState,
    setState: useReactFlow.setState,
    isValidConnection: alwaysValidConnection,
    edgeUpdaterType: handleType,
    onReconnectEnd: () => {
      setUpdating(false);
    },
  });
}

export default (EdgeComponent: ComponentType<WrapEdgeProps>) => {
  const EdgeWrapper = ({
    id,
    className,
    type,
    data,
    selected,
    animated,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    elementsSelectable = true,
    hidden,
    sourceHandleId,
    targetHandleId,
    reconnectRadius = 10,
    onReconnect,
    isReconnectable = true,
    markerEnd,
    markerStart,
    interactionWidth,
  }: WrapEdgeProps): JSX.Element | null => {
    const edgeRef = useRef<SVGGElement>(null);
    const [updateHover, setUpdateHover] = useState(false);
    const [updating, setUpdating] = useState(false);

    if (hidden) {
      return null;
    }

    const onEdgeUpdaterSourceMouseDown = (
      event: ReactMouseEvent<SVGGElement, MouseEvent>,
    ) =>
      startEdgeReconnect({
        endpoint: "source",
        event,
        onReconnect,
        setUpdating,
        source,
        sourceHandleId,
        target,
        targetHandleId,
      });
    const onEdgeUpdaterTargetMouseDown = (
      event: ReactMouseEvent<SVGGElement, MouseEvent>,
    ) =>
      startEdgeReconnect({
        endpoint: "target",
        event,
        onReconnect,
        setUpdating,
        source,
        sourceHandleId,
        target,
        targetHandleId,
      });

    const onEdgeUpdaterMouseEnter = () => setUpdateHover(true);
    const onEdgeUpdaterMouseOut = () => setUpdateHover(false);

    const inactive = !elementsSelectable;
    const wrapperClassName = getEdgeWrapperClassName({
      animated,
      className,
      inactive,
      selected,
      type,
      updateHover,
    });

    return (
      <g
        className={wrapperClassName}
        onClick={(event) => onEdgeClick({ elementsSelectable, event, id })}
        tabIndex={0}
        role="button"
        ref={edgeRef}
      >
        <EdgeShape
          EdgeComponent={EdgeComponent}
          id={id}
          className={className}
          type={type}
          data={data}
          selected={selected}
          animated={animated}
          label={label}
          labelStyle={labelStyle}
          labelShowBg={labelShowBg}
          labelBgStyle={labelBgStyle}
          labelBgPadding={labelBgPadding}
          labelBgBorderRadius={labelBgBorderRadius}
          style={style}
          source={source}
          target={target}
          sourceX={sourceX}
          sourceY={sourceY}
          targetX={targetX}
          targetY={targetY}
          sourcePosition={sourcePosition}
          targetPosition={targetPosition}
          sourceHandleId={sourceHandleId}
          targetHandleId={targetHandleId}
          markerStart={markerStart}
          markerEnd={markerEnd}
          interactionWidth={interactionWidth}
          updating={updating}
        />
        <ReconnectAnchors
          isReconnectable={isReconnectable}
          reconnectRadius={reconnectRadius}
          sourcePosition={sourcePosition}
          sourceX={sourceX}
          sourceY={sourceY}
          targetPosition={targetPosition}
          targetX={targetX}
          targetY={targetY}
          onEdgeUpdaterSourceMouseDown={onEdgeUpdaterSourceMouseDown}
          onEdgeUpdaterTargetMouseDown={onEdgeUpdaterTargetMouseDown}
          onEdgeUpdaterMouseEnter={onEdgeUpdaterMouseEnter}
          onEdgeUpdaterMouseOut={onEdgeUpdaterMouseOut}
        />
      </g>
    );
  };

  EdgeWrapper.displayName = "EdgeWrapper";

  return memo(EdgeWrapper);
};
