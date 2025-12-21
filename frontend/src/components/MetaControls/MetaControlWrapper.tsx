import cc from "classcat";
import useDrag from "forks/xyflow/core/hooks/useDrag";
import _ from "lodash";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { getActiveViewModeConfig } from "state/actions/sectionInfos";
import { deleteNodes } from "state/actions/nodeInternals";
import type { MetaControl } from "state/definitions";
import {
  useMetaControls,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
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
  const isLocked = control.positionAndSizeLocked;
  const canDrag = isDraggable && !isLocked;

  const onToggleLock = () => {
    useMetaControls.setState((state) => ({
      controls: state.controls.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              positionAndSizeLocked: !entry.positionAndSizeLocked,
            }
          : entry,
      ),
    }));
  };

  const onDelete = () => {
    useMetaControls.setState((state) => ({
      controls: state.controls.filter((entry) => entry.id !== id),
    }));
    deleteNodes([id]);
  };

  const onRename = (value: string) => {
    useMetaControls.setState((state) => ({
      controls: state.controls.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              label: value,
            }
          : entry,
      ),
    }));
  };

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
    disabled: !canDrag,
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
          [NO_PAN_CLASS_NAME]: canDrag,
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
      <div className={canDrag ? "cursor-grab active:cursor-grabbing" : ""}>
        <MetaControlNode
          control={control}
          showChrome={!isUserView}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onRename={onRename}
        />
      </div>
    </div>
  );
}
