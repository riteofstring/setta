import cc from "classcat";
import _ from "lodash";
import type { CSSProperties } from "react";
import { memo, useEffect, useRef } from "react";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Position } from "../document/types";
import { NO_PAN_CLASS_NAME } from "../interaction";
import { useSectionContentRenderer } from "./sectionContentContext";
import useDrag from "./useDrag";

export const arrowKeyDiffs: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const NodeWrapperComponent = ({
  id,
  isDraggable: _isDraggable,
  resizeObserver,
  visibility,
}: {
  id: string;
  isDraggable: boolean;
  resizeObserver: ResizeObserver | null;
  visibility: CSSProperties["visibility"];
}) => {
  const node = useNodeInternals((x) => x.x.get(id), _.isEqual);
  const section = useWorkspaceDocument((x) => x.sections[id]);
  const nodeRef = useRef<HTMLDivElement>(null);
  const renderSectionContent = useSectionContentRenderer();
  const isDraggable = _isDraggable && section !== undefined && !section.positionAndSizeLocked;

  useEffect(() => {
    if (nodeRef.current) {
      const currNode = nodeRef.current;
      resizeObserver?.observe(currNode);

      return () => resizeObserver?.unobserve(currNode);
    }
  }, [resizeObserver]);

  useDrag({
    nodeRef,
    disabled: !isDraggable,
    nodeId: id,
  });

  if (!section) {
    throw new Error(`Canvas node ${id} has no section record.`);
  }

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
    >
      {renderSectionContent(section)}
    </div>
  );
};

export const NodeWrapper = memo(NodeWrapperComponent);
