import type { ComponentType } from "react";
import React, { memo, useRef, useState } from "react";

import { toggleEdgeSelection } from "state/actions/edges";
import { useReactFlow } from "../../store";
import type { Connection, HandleType, WrapEdgeProps } from "../../types";
import { handlePointerDown } from "../Handle/handler";
import { EdgeAnchor } from "./EdgeAnchor";

const alwaysValidConnection = () => true;

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

    const onEdgeClick = (event: React.MouseEvent<SVGGElement, MouseEvent>) => {
      if (!elementsSelectable) {
        return;
      }
      event.stopPropagation();
      const multiSelectionActive = useReactFlow.getState().multiSelectionActive;
      toggleEdgeSelection(id, multiSelectionActive);
    };

    const handleEdgeUpdater = (
      event: React.MouseEvent<SVGGElement, MouseEvent>,
      isSourceHandle: boolean,
    ) => {
      if (event.button !== 0 || !onReconnect) {
        return;
      }

      const nodeId = isSourceHandle ? target : source;
      const handleId =
        (isSourceHandle ? targetHandleId : sourceHandleId) || null;
      const handleType: HandleType = isSourceHandle ? "target" : "source";
      const isTarget = isSourceHandle;

      setUpdating(true);

      const onConnectEdge = (connection: Connection) => onReconnect(connection);
      const onReconnectEnd = () => {
        setUpdating(false);
      };

      handlePointerDown({
        event,
        handleId,
        nodeId,
        onConnect: onConnectEdge,
        isTarget,
        getState: useReactFlow.getState,
        setState: useReactFlow.setState,
        isValidConnection: alwaysValidConnection,
        edgeUpdaterType: handleType,
        onReconnectEnd,
      });
    };

    const onEdgeUpdaterSourceMouseDown = (
      event: React.MouseEvent<SVGGElement, MouseEvent>,
    ) => handleEdgeUpdater(event, true);
    const onEdgeUpdaterTargetMouseDown = (
      event: React.MouseEvent<SVGGElement, MouseEvent>,
    ) => handleEdgeUpdater(event, false);

    const onEdgeUpdaterMouseEnter = () => setUpdateHover(true);
    const onEdgeUpdaterMouseOut = () => setUpdateHover(false);

    const inactive = !elementsSelectable;

    return (
      <g
        className={[
          "react-flow__edge",
          type ? `react-flow__edge-${type}` : null,
          className,
          selected ? "selected" : null,
          animated ? "animated" : null,
          inactive ? "inactive" : null,
          updateHover ? "updating" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onEdgeClick}
        tabIndex={0}
        role="button"
        ref={edgeRef}
      >
        {!updating && (
          <EdgeComponent
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
          />
        )}
        {isReconnectable && (
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
        )}
      </g>
    );
  };

  EdgeWrapper.displayName = "EdgeWrapper";

  return memo(EdgeWrapper);
};
