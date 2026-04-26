import cc from "classcat";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import useDrag from "forks/xyflow/core/hooks/useDrag";
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
import type { CanvasFlowNodeElementMap } from "./canvasFlowTypes";

type CanvasFlowNodeLayerProps = {
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  schedulePaint: () => void;
};

type CanvasFlowNodeWrapperProps = {
  id: string;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  schedulePaint: () => void;
};

function CanvasFlowNodeLayer({
  nodeElementsRef,
  resizeObserver,
  schedulePaint,
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
          key={nodeId}
          id={nodeId}
          nodeElementsRef={nodeElementsRef}
          resizeObserver={resizeObserver}
          schedulePaint={schedulePaint}
        />
      ))}
    </>
  );
}

function _CanvasFlowNodeWrapper({
  id,
  nodeElementsRef,
  resizeObserver,
  schedulePaint,
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
        element.style.pointerEvents = "none";
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

  useDrag({
    nodeRef: nodeRef as RefObject<Element>,
    disabled: !isDraggable,
    nodeId: id,
  });

  if (!node) {
    return null;
  }

  return (
    <div
      className={cc([
        "react-flow__node",
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
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    transformOrigin: "0 0",
    width: node.width ?? undefined,
    zIndex: node.tempZIndex,
  };
}

const CanvasFlowNodeWrapper = memo(_CanvasFlowNodeWrapper);

export default memo(CanvasFlowNodeLayer);
