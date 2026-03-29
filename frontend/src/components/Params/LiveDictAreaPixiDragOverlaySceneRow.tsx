import { useSortable } from "forks/dnd-kit/adapter";
import {
  applyZoomToTransform,
  transformToString,
} from "forks/dnd-kit/adapter/zoom";
import {
  getParamDndItemId,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";
import { useCallback, type MouseEvent } from "react";
import { toggleParamSelected } from "state/actions/sectionInfos";
import { LiveDictAreaPixiDragOverlayParamRow } from "./LiveDictAreaPixiDragOverlayParamRow";
import type { LiveDictAreaPixiDragOverlayRowState } from "./liveDictAreaPixiDragOverlayRowState";
import { useParamDndContext } from "./ParamDndContext";
import type { ParamSceneRowPacket } from "./paramSwitchScenePackets";

export type LiveDictAreaPixiDragOverlaySceneRowPacket = ParamSceneRowPacket & {
  childIds: string[];
};

type LiveDictAreaPixiDragOverlaySceneRowProps = {
  hasSectionStyleTheme: boolean;
  isSelectingParams: boolean;
  listKey: ParamListKey;
  rowState: LiveDictAreaPixiDragOverlayRowState;
  scenePacket: LiveDictAreaPixiDragOverlaySceneRowPacket;
  sectionId: string;
};

export function LiveDictAreaPixiDragOverlaySceneRow({
  hasSectionStyleTheme,
  isSelectingParams,
  listKey,
  rowState,
  scenePacket,
  sectionId,
}: LiveDictAreaPixiDragOverlaySceneRowProps) {
  const paramInfoId = scenePacket.id;
  const handleParamMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!isSelectingParams) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
    },
    [isSelectingParams],
  );
  const handleParamClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!isSelectingParams) {
        return;
      }
      event.stopPropagation();
      toggleParamSelected(sectionId, paramInfoId);
    },
    [isSelectingParams, paramInfoId, sectionId],
  );

  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";
  const bg = rowState.isSelected
    ? `transition-colors rounded-sm ${selectedBgClassName}`
    : "transition-colors rounded-sm";

  let border = "";
  if (rowState.hasError) {
    border = "bg-red-200 dark:bg-red-800/30";
  } else if (rowState.isFocusedSearchResult) {
    border = "outline outline-4 outline-green-500 dark:outline-green-500/80";
  } else if (rowState.isSearchResult) {
    border = "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }

  const dndContext = useParamDndContext();
  const dndEnabled = Boolean(dndContext?.enabled);
  const dndId = getParamDndItemId(paramInfoId, listKey);
  const hasNested = scenePacket.childIds.length > 0;
  const onlyChildId =
    scenePacket.childIds.length === 1 ? scenePacket.childIds[0] : null;
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: dndId,
    disabled: !dndEnabled,
    data: {
      type: "param",
      paramId: paramInfoId,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested,
      onlyChildId,
    },
  });
  const { role: _role, ...restAttributes } = attributes;
  const scaledTransform = applyZoomToTransform(transform);
  const dndStyle = {
    transform: transformToString(scaledTransform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <LiveDictAreaPixiDragOverlayParamRow
      bg={bg}
      border={border}
      dndAttributes={restAttributes}
      dndClassName={isDragging ? "opacity-80" : ""}
      dndListeners={listeners}
      dndRef={setNodeRef}
      dndStyle={dndStyle}
      hasSectionStyleTheme={hasSectionStyleTheme}
      label={
        <p className="cursor-pointer truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200">
          {scenePacket.label ?? ""}
        </p>
      }
      onClick={handleParamClick}
      onMouseDown={handleParamMouseDown}
      paramInfoId={paramInfoId}
      scenePacket={scenePacket}
    />
  );
}
