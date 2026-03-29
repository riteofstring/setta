import { useSortable } from "forks/dnd-kit/adapter";
import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";
import {
  useParamDndState,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";
import { useReactFlow } from "forks/xyflow/core/store";
import type { MouseEventHandler } from "react";
import { LiveDictAreaPixiDragOverlayParamRow } from "./LiveDictAreaPixiDragOverlayParamRow";
import { useParamDndContext } from "./ParamDndContext";

const noopMouseHandler: MouseEventHandler<HTMLElement> = () => {};

type LiveDictAreaPixiDragOverlayPlaceholderRowProps = {
  depth: number;
  hasSectionStyleTheme: boolean;
  listKey: ParamListKey;
  paramInfoId: string;
  sectionId: string;
};

export function LiveDictAreaPixiDragOverlayPlaceholderRow({
  depth,
  hasSectionStyleTheme,
  listKey,
  paramInfoId,
  sectionId,
}: LiveDictAreaPixiDragOverlayPlaceholderRowProps) {
  const dndContext = useParamDndContext();
  const dndEnabled = Boolean(dndContext?.enabled);
  const placeholderWidth = useParamDndState((state) => state.placeholderWidth);
  const placeholderHeight = useParamDndState(
    (state) => state.placeholderHeight,
  );
  const zoom = useReactFlow((state) => state.transform[2]);
  const safeZoom = zoom > 0 ? zoom : 1;
  const normalizedWidth =
    placeholderWidth !== null ? placeholderWidth / safeZoom : null;
  const normalizedHeight =
    placeholderHeight !== null ? placeholderHeight / safeZoom : null;
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: paramInfoId,
    disabled: !dndEnabled,
    data: {
      type: "param",
      paramId: null,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested: false,
      onlyChildId: null,
    },
  });
  const { role: _role, ...restAttributes } = attributes;
  const scaledTransform = applyZoomToTransform(transform);
  const dndStyle = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
    height: normalizedHeight ?? undefined,
    width: normalizedWidth ?? undefined,
  };

  return (
    <LiveDictAreaPixiDragOverlayParamRow
      bg="bg-blue-500/40 dark:bg-blue-600/40"
      border=""
      dndAttributes={restAttributes}
      dndClassName={isDragging ? "opacity-80" : ""}
      dndListeners={listeners}
      dndRef={setNodeRef}
      dndStyle={dndStyle}
      hasSectionStyleTheme={hasSectionStyleTheme}
      label={
        <span
          aria-hidden="true"
          className="block h-2 w-full rounded-sm bg-blue-500/25 dark:bg-blue-400/25"
        />
      }
      onClick={noopMouseHandler}
      onMouseDown={noopMouseHandler}
      paramInfoId={paramInfoId}
      scenePacket={{
        depth,
        id: paramInfoId,
        kind: "placeholder",
        label: null,
      }}
    />
  );
}
