import cc from "classcat";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { shallow } from "zustand/shallow";
import type {
  CanvasFlowNodeElementMap,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import { useCanvasFlowNodeDrag } from "./useCanvasFlowNodeDrag";

type CanvasFlowNodeLayerProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  schedulePaint: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

type CanvasFlowNodeWrapperProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  id: string;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  schedulePaint: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
};

function CanvasFlowNodeLayer({
  canvasRef,
  nodeElementsRef,
  resizeObserver,
  schedulePaint,
  viewportRef,
}: CanvasFlowNodeLayerProps) {
  const nodeIds = useNodeInternals(
    (state) => Array.from(state.x.keys()),
    shallow,
  );

  useEffect(() => {
    schedulePaint();
  }, [nodeIds, schedulePaint]);

  return (
    <>
      {nodeIds.map((nodeId) => (
        <CanvasFlowNodeWrapper
          canvasRef={canvasRef}
          key={nodeId}
          id={nodeId}
          nodeElementsRef={nodeElementsRef}
          resizeObserver={resizeObserver}
          schedulePaint={schedulePaint}
          viewportRef={viewportRef}
        />
      ))}
    </>
  );
}

function _CanvasFlowNodeWrapper({
  canvasRef,
  id,
  nodeElementsRef,
  resizeObserver,
  schedulePaint,
  viewportRef,
}: CanvasFlowNodeWrapperProps) {
  const node = useNodeInternals((state) => state.x.get(id), _.isEqual);
  const panActivationKeyPressed = useReactFlow((state) =>
    Boolean(
      (state as { panActivationKeyPressed?: boolean }).panActivationKeyPressed,
    ),
  );
  const positionAndSizeLocked = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, id);
    return impl.positionAndSizeLocked;
  });
  const nodeRef = useRef<HTMLDivElement>(null);
  const observedElementRef = useRef<HTMLDivElement | null>(null);
  const isDraggable = !panActivationKeyPressed && !positionAndSizeLocked;
  const dragHandlers = useCanvasFlowNodeDrag({
    canvasRef,
    disabled: !isDraggable,
    nodeId: id,
    nodeRef,
    schedulePaint,
    viewportRef,
  });

  const setNodeRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (observedElementRef.current) {
        resizeObserver?.unobserve(observedElementRef.current);
        nodeElementsRef.current.delete(id);
      }
      nodeRef.current = element;
      observedElementRef.current = element;
      if (element) {
        nodeElementsRef.current.set(id, element);
        resizeObserver?.observe(element);
      }
      schedulePaint();
    },
    [id, nodeElementsRef, resizeObserver, schedulePaint],
  );

  useEffect(() => {
    return () => {
      const element = observedElementRef.current;
      if (element) {
        resizeObserver?.unobserve(element);
      }
      nodeElementsRef.current.delete(id);
      schedulePaint();
    };
  }, [id, nodeElementsRef, resizeObserver, schedulePaint]);

  useEffect(() => {
    schedulePaint();
  }, [
    node?.height,
    node?.position.x,
    node?.position.y,
    node?.tempZIndex,
    node?.width,
    schedulePaint,
  ]);

  if (!node) {
    return null;
  }

  return (
    <div
      {...dragHandlers}
      className={cc([
        "canvas-flow__node",
        {
          [NO_PAN_CLASS_NAME]: isDraggable,
        },
      ])}
      data-id={id}
      data-testid={`rf__node-${id}`}
      ref={setNodeRef}
      style={getNodeStyle(node)}
    >
      <SectionContainer sectionId={id} isTopLevel={true} />
    </div>
  );
}

function getNodeStyle(node: Node): CSSProperties {
  return {
    height: node.height ?? undefined,
    left: 0,
    pointerEvents: "auto",
    position: "absolute",
    top: 0,
    transformOrigin: "0 0",
    width: node.width ?? undefined,
    zIndex: node.tempZIndex,
  };
}

const CanvasFlowNodeWrapper = memo(_CanvasFlowNodeWrapper);

export default memo(CanvasFlowNodeLayer);
