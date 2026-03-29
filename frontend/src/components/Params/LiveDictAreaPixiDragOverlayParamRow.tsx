import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import type {
  CSSProperties,
  HTMLAttributes,
  MouseEventHandler,
  ReactNode,
  Ref,
} from "react";
import { GetParamSwitch } from "./GetParamSwitch";
import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";
import { useParamDndChildrenForParent } from "./ParamDndContext";
import type { ParamSceneRowPacket } from "./paramSwitchScenePackets";

type LiveDictAreaPixiDragOverlayParamRowProps = {
  bg: string;
  border: string;
  dndAttributes?: HTMLAttributes<HTMLElement>;
  dndClassName?: string;
  dndListeners?: HTMLAttributes<HTMLElement>;
  dndRef?: Ref<HTMLElement>;
  dndStyle?: CSSProperties;
  hasSectionStyleTheme: boolean;
  label: ReactNode;
  listKey: ParamListKey;
  onClick: MouseEventHandler<HTMLElement>;
  onMouseDown: MouseEventHandler<HTMLElement>;
  onResizeStart: MouseEventHandler;
  paramChildren: string[];
  paramInfoId: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  scenePacket: ParamSceneRowPacket;
  sectionId: string;
};

export function LiveDictAreaPixiDragOverlayParamRow({
  bg,
  border,
  dndAttributes,
  dndClassName,
  dndListeners,
  dndRef,
  dndStyle,
  hasSectionStyleTheme,
  label,
  listKey,
  onClick,
  onMouseDown,
  onResizeStart,
  paramChildren,
  paramInfoId,
  requiredParamIdsToPaths,
  scenePacket,
  sectionId,
}: LiveDictAreaPixiDragOverlayParamRowProps) {
  const renderChildren = useParamDndChildrenForParent(
    paramInfoId,
    paramChildren,
  );
  const hoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
  const rowIndent =
    LIVE_DICT_AREA_PIXI_LAYOUT.titleInsetX +
    scenePacket.depth * LIVE_DICT_AREA_PIXI_LAYOUT.rowIndent;

  return (
    <>
      <article
        className={`relative col-span-full flex min-w-0 items-center rounded-sm px-2 py-[2px] transition-colors ${hoverClassName} ${bg} ${border} ${dndClassName ?? ""}`}
        style={{
          gridColumn: "1 / -1",
          minHeight: LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight - 4,
          paddingLeft: rowIndent,
          ...(dndStyle ?? {}),
        }}
        data-live-dict-area-drag-overlay-row="true"
        data-live-dict-area-drag-overlay-row-id={paramInfoId}
        data-live-dict-area-scene-row-depth={scenePacket.depth}
        data-live-dict-area-scene-row-kind={scenePacket.kind}
        data-param-render-mode="drag-overlay"
        data-param-row="true"
        onClick={onClick}
        onMouseDownCapture={onMouseDown}
        ref={dndRef}
        tabIndex={-1}
        role={undefined}
        {...(dndAttributes ?? {})}
        {...(dndListeners ?? {})}
      >
        <div className="min-w-0 flex-1">{label}</div>
      </article>
      {renderChildren.length > 0 ? (
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={renderChildren}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={false}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          renderMode="drag-overlay"
        />
      ) : null}
    </>
  );
}
