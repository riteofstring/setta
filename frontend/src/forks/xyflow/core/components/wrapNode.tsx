import cc from "classcat";
import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import _ from "lodash";
import type { CSSProperties } from "react";
import { memo, useEffect, useRef } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { Position } from "utils/generatedTypes";
import useDrag from "../hooks/useDrag";
import type { Node } from "../types";

export const arrowKeyDiffs: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const _NodeWrapper = ({
  id,
  isDraggable: _isDraggable,
  resizeObserver,
  visibility,
}: Pick<Node, "id"> & {
  isDraggable: boolean;
  resizeObserver: ResizeObserver | null;
  visibility: CSSProperties["visibility"];
}) => {
  const node = useNodeInternals((x) => x.x.get(id), _.isEqual);
  const nodeRef = useRef<HTMLDivElement>(null);
  const positionAndSizeLocked = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, id);
    return impl.positionAndSizeLocked;
  });
  const isDraggable = _isDraggable && !positionAndSizeLocked;

  useEffect(() => {
    if (nodeRef.current) {
      const currNode = nodeRef.current;
      resizeObserver?.observe(currNode);

      return () => resizeObserver?.unobserve(currNode);
    }
  }, []);

  useDrag({
    nodeRef,
    disabled: !isDraggable,
    nodeId: id,
  });

  return (
    <div
      className={cc([
        "react-flow__node",
        {
          // this is overwritable by passing `nopan` as a class name
          [NO_PAN_CLASS_NAME]: isDraggable,
        },
      ])}
      ref={nodeRef}
      style={{
        transform: `translate(${node?.position.x}px,${node?.position.y}px)`,
        pointerEvents: "all",
        visibility,
        zIndex: node?.tempZIndex,
      }}
      data-id={id}
      data-testid={`rf__node-${id}`}
    >
      <SectionContainerBoundary sectionId={id} />
    </div>
  );
};

export const NodeWrapper = memo(_NodeWrapper);
