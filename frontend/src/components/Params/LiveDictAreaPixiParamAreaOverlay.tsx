import { useCallback, useRef } from "react";
import { useLocalStorage, useTemporaryMiscState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import type {
  LiveDictAreaMountProps,
  LiveDictAreaParamAreaSurfaceBlock,
} from "./groupContainerLiveDictAreaMount";
import { getPinnedParamsBgClassName } from "./groupContainerView";
import type { LiveDictAreaPixiDragRowTarget } from "./liveDictAreaPixiDragRowTargets";
import { LIVE_DICT_AREA_PIXI_LAYOUT } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiParamAreaOverlayRows } from "./LiveDictAreaPixiParamAreaOverlayRows";
import { ParamDndList } from "./ParamDndList";

type LiveDictAreaPixiParamAreaOverlayProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  target: LiveDictAreaPixiDragRowTarget;
};

export function LiveDictAreaPixiParamAreaOverlay({
  liveDictAreaMountProps,
  target,
}: LiveDictAreaPixiParamAreaOverlayProps) {
  const surfaceBlock = liveDictAreaMountProps.liveDictAreaSurface.blocks.find(
    (block): block is LiveDictAreaParamAreaSurfaceBlock =>
      (block.kind === "pinned-param-area" ||
        block.kind === "unpinned-param-area") &&
      block.props.domPacket.visualPacket.blockId === target.blockId,
  );

  if (!surfaceBlock) {
    return null;
  }

  return (
    <div
      className="pointer-events-auto absolute z-20"
      data-live-dict-area-drag-overlay="active"
      data-live-dict-area-drag-overlay-block-id={target.blockId}
      data-live-dict-area-drag-overlay-kind="param-list"
      data-live-dict-area-drag-overlay-row-id={target.rowId}
      style={{
        left: target.blockX,
        minHeight: target.blockHeight,
        right: 0,
        top: target.blockY,
      }}
    >
      <LiveDictAreaPixiParamAreaOverlayList block={surfaceBlock} />
    </div>
  );
}

const LIVE_DICT_AREA_PIXI_PARAM_LIST_TOP_PADDING =
  LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
  LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop;

function LiveDictAreaPixiParamAreaOverlayList({
  block,
}: {
  block: LiveDictAreaParamAreaSurfaceBlock;
}) {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(
    block.props.sectionId,
  );
  const previewStyleColor = useTemporaryMiscState(
    (state) => state[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined
      ? block.props.domPacket.styleColor
      : previewStyleColor;
  const hasSectionStyleTheme = Boolean(
    resolvedStyleColor
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null,
  );

  if (block.kind === "pinned-param-area") {
    const { domPacket, handleColumnResizeStart, sectionId } = block.props;
    const pinnedBgClassName = hasSectionStyleTheme
      ? "bg-[color:var(--setta-section-style-panel-bg)]"
      : getPinnedParamsBgClassName(domPacket.sectionTypeName);
    const pinnedBorderColorClassName = hasSectionStyleTheme
      ? "border-[color:var(--setta-section-style-border)]"
      : "border-white dark:border-setta-700/30";
    const roundedBottomClassName = domPacket.visualPacket.shouldRoundBottom
      ? domPacket.positionAndSizeLocked
        ? "rounded-b-sm"
        : "rounded-b-xl"
      : "";

    return (
      <div
        className={`flex min-h-full w-full shrink-0 flex-col items-start border-b shadow-sm ${pinnedBorderColorClassName} ${pinnedBgClassName} ${roundedBottomClassName}`}
        data-live-dict-area-drag-overlay-list="pinned"
      >
        <div
          className="section-args-nested section-key-value section-min-rows grid min-h-full w-full flex-1 grid-cols-subgrid content-start gap-y-1 pr-1.5"
          style={{
            paddingBottom: LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom,
            paddingTop: LIVE_DICT_AREA_PIXI_PARAM_LIST_TOP_PADDING,
          }}
        >
          <ParamDndList
            sectionId={sectionId}
            paramIds={domPacket.visualPacket.list.topLevelParamIds}
            requiredParamIdsToPaths={
              domPacket.visualPacket.list.requiredParamIdsToPaths
            }
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey={domPacket.visualPacket.list.listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
            renderMode="drag-overlay"
            renderParamListBody={(props) => (
              <LiveDictAreaPixiParamAreaOverlayRows
                {...props}
                isSelectingParams={
                  domPacket.visualPacket.list.isSelectingParams
                }
                sceneRows={domPacket.visualPacket.list.rows}
                selectedParamIds={domPacket.visualPacket.list.selectedParamIds}
              />
            )}
          />
        </div>
      </div>
    );
  }

  return (
    <LiveDictAreaPixiUnpinnedParamAreaOverlayList
      block={block}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  );
}

function LiveDictAreaPixiUnpinnedParamAreaOverlayList({
  block,
  hasSectionStyleTheme,
}: {
  block: Extract<
    LiveDictAreaParamAreaSurfaceBlock,
    { kind: "unpinned-param-area" }
  >;
  hasSectionStyleTheme: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { ref: scrollRef, isScrollable } = useIsScrollable();
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      scrollRef.current = node;
    },
    [scrollRef],
  );
  const { domPacket, handleColumnResizeStart, sectionId } = block.props;

  return (
    <div
      className="flex min-h-full min-w-0 flex-1 flex-col overflow-hidden"
      data-live-dict-area-drag-overlay-list="unpinned"
    >
      <div
        className={`section-args-nested grid min-h-full min-w-0 !max-w-full flex-1 auto-rows-min grid-cols-subgrid content-start gap-y-1 overflow-x-clip overflow-y-scroll pr-1.5 ${
          isScrollable ? "nowheel" : ""
        }`}
        ref={setContainerRef}
        style={{
          minHeight: domPacket.visualPacket.container.shouldApplyMinHeight
            ? domPacket.visualPacket.container.minHeight ?? undefined
            : undefined,
          paddingBottom: LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom,
          paddingTop: LIVE_DICT_AREA_PIXI_PARAM_LIST_TOP_PADDING,
        }}
      >
        <ParamDndList
          sectionId={sectionId}
          paramIds={domPacket.visualPacket.list.topLevelParamIds}
          requiredParamIdsToPaths={
            domPacket.visualPacket.list.requiredParamIdsToPaths
          }
          onResizeStart={handleColumnResizeStart}
          isTopLevel={true}
          listKey={domPacket.visualPacket.list.listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          renderMode="drag-overlay"
          renderParamListBody={(props) => (
            <LiveDictAreaPixiParamAreaOverlayRows
              {...props}
              isSelectingParams={domPacket.visualPacket.list.isSelectingParams}
              sceneRows={domPacket.visualPacket.list.rows}
              selectedParamIds={domPacket.visualPacket.list.selectedParamIds}
            />
          )}
        />
      </div>
    </div>
  );
}
