import cc from "classcat";
import useDrag from "forks/xyflow/core/hooks/useDrag";
import _ from "lodash";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { getActiveViewModeConfig } from "state/actions/sectionInfos";
import type { MetaControl } from "state/definitions";
import { useNodeInternals, useProjectState } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { MetaControlNode } from "./MetaControlNode";

type MetaControlWrapperProps = {
  id: string;
  control: MetaControl;
  isDraggable: boolean;
  resizeObserver: ResizeObserver | null;
  visibility: CSSProperties["visibility"];
};

export function MetaControlWrapper({
  id,
  control,
  isDraggable,
  resizeObserver,
  visibility,
}: MetaControlWrapperProps) {
  const node = useNodeInternals((x) => x.x.get(id), _.isEqual);
  const nodeRef = useRef<HTMLDivElement>(null);
  const isUserView = useProjectState((state) => {
    const viewMode = getActiveViewModeConfig(state);
    return viewMode.isUserFacing && !state.projectConfig.isEditingViewMode;
  });

  useEffect(() => {
    if (!nodeRef.current) {
      return;
    }

    const currNode = nodeRef.current;
    resizeObserver?.observe(currNode);

    return () => resizeObserver?.unobserve(currNode);
  }, [resizeObserver]);

  useDrag({
    nodeRef,
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
        {
          [NO_PAN_CLASS_NAME]: isDraggable,
        },
      ])}
      ref={nodeRef}
      style={{
        transform: `translate(${node.position.x}px,${node.position.y}px)`,
        pointerEvents: "all",
        visibility,
        zIndex: node.tempZIndex,
      }}
      data-id={id}
      data-testid={`rf__node-${id}`}
    >
      <div className="cursor-grab active:cursor-grabbing">
        <MetaControlNode control={control} showChrome={!isUserView} />
      </div>
    </div>
  );
}
