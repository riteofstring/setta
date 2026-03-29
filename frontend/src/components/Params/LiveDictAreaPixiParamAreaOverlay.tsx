import {
  LiveDictAreaParamAreaMount,
  type LiveDictAreaMountProps,
  type LiveDictAreaParamAreaSurfaceBlock,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaPixiDragRowTarget } from "./liveDictAreaPixiDragRowTargets";

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
      data-live-dict-area-drag-overlay-kind="param-area"
      data-live-dict-area-drag-overlay-row-id={target.rowId}
      style={{
        left: target.blockX,
        minHeight: target.blockHeight,
        right: 0,
        top: target.blockY,
      }}
    >
      <LiveDictAreaParamAreaMount block={surfaceBlock} />
    </div>
  );
}
