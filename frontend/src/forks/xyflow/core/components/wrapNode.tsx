import cc from "classcat";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useFloatingBox } from "components/Utils/FloatingBox";
import _ from "lodash";
import type { CSSProperties, KeyboardEvent } from "react";
import { memo, useEffect, useRef } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
} from "utils/constants";
import { Position } from "utils/generatedTypes";
import useDrag from "../hooks/useDrag";
import { updatePositions } from "../hooks/useUpdateNodePositions";
import type { Node } from "../types";
import { isInputDOMNode } from "../utils";

export const arrowKeyDiffs: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const _NodeWrapper = ({
  id,
  selected,
  isDraggable: _isDraggable,
  resizeObserver,
  visibility,
}: Pick<Node, "id"> & {
  selected: boolean;
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
  const hasPointerEvents = true;

  const onKeyDown = (event: KeyboardEvent) => {
    if (isInputDOMNode(event) || useFloatingBox.getState().isEnabled) {
      return;
    }

    // Early return if target element has the prevent class
    const target = event.target as HTMLElement;
    if (target.classList.contains(SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION)) {
      return;
    }

    if (
      isDraggable &&
      selected &&
      Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)
    ) {
      updatePositions({
        x: arrowKeyDiffs[event.key].x,
        y: arrowKeyDiffs[event.key].y,
        isShiftPressed: event.shiftKey,
      });
    }
  };

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
        pointerEvents: hasPointerEvents ? "all" : "none",
        visibility,
        zIndex: node?.tempZIndex,
      }}
      data-id={id}
      data-testid={`rf__node-${id}`}
      // onKeyDown={isFocusable ? onKeyDown : undefined}
      // tabIndex={isFocusable ? 0 : undefined}
      // role={isFocusable ? "button" : undefined}
    >
      <SectionContainer sectionId={id} isTopLevel={true} />
    </div>
  );
};

export const NodeWrapper = memo(_NodeWrapper);
