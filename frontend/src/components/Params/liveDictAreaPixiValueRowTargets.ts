import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import type { MouseEventHandler } from "react";
import type { LiveDictAreaMountProps } from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiLayout,
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";
import type { ParamEditorKind } from "./paramEditorActivation";

type LiveDictAreaPixiValueRowSurfaceBlock = Extract<
  LiveDictAreaMountProps["liveDictAreaSurface"]["blocks"][number],
  {
    kind: "pinned-param-area" | "unpinned-param-area";
  }
>;

export type LiveDictAreaPixiValueRowTarget = {
  blockId: "pinned" | "unpinned";
  editorKind: ParamEditorKind;
  handleColumnResizeStart: MouseEventHandler<HTMLDivElement>;
  height: number;
  label: string;
  listKey: ParamListKey;
  requiredParamIdsToPaths: Record<string, string[]>;
  rowId: string;
  sectionId: string;
  styleColor: string | null;
  valueText: string | null;
  width: number;
  x: number;
  y: number;
};

export function getLiveDictAreaPixiValueRowHandoffAriaLabel({
  label,
  valueText,
}: Pick<LiveDictAreaPixiValueRowTarget, "label" | "valueText">) {
  const trimmedLabel = label.trim();
  const trimmedValueText = valueText?.trim() ?? "";

  if (trimmedLabel.length === 0) {
    return trimmedValueText;
  }

  if (trimmedValueText.length === 0) {
    return trimmedLabel;
  }

  return `${trimmedLabel} "${trimmedValueText}"`;
}

export function buildLiveDictAreaPixiValueRowTargets({
  layout,
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: {
  layout?: LiveDictAreaPixiLayout | null;
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
}): LiveDictAreaPixiValueRowTarget[] {
  const resolvedLayout =
    layout ??
    buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth,
    });
  const paramAreaBlocks = new Map<
    LiveDictAreaPixiValueRowSurfaceBlock["props"]["domPacket"]["blockId"],
    LiveDictAreaPixiValueRowSurfaceBlock
  >(
    liveDictAreaMountProps.liveDictAreaSurface.blocks.flatMap((block) =>
      block.kind === "pinned-param-area" || block.kind === "unpinned-param-area"
        ? [[block.props.domPacket.blockId, block] as const]
        : [],
    ),
  );

  return resolvedLayout.paramAreas.flatMap((paramArea) => {
    const surfaceBlock = paramAreaBlocks.get(paramArea.blockId);
    if (!surfaceBlock) {
      return [];
    }

    return paramArea.rows.flatMap((row) => {
      if (row.kind !== "value") {
        return [];
      }
      if (!row.editorKind) {
        throw new Error(
          `Missing Pixi value-row editor kind for ${row.id} in ${paramArea.blockId}.`,
        );
      }

      const requiredPath =
        surfaceBlock.props.domPacket.visualPacket.list.requiredParamIdsToPaths[
          row.id
        ];
      if (!requiredPath) {
        return [];
      }

      return [
        {
          blockId: paramArea.blockId,
          editorKind: row.editorKind,
          handleColumnResizeStart: surfaceBlock.props.handleColumnResizeStart,
          height: row.blockHeight,
          label: row.labelText,
          listKey: surfaceBlock.props.domPacket.visualPacket.list.listKey,
          requiredParamIdsToPaths: {
            [row.id]: requiredPath,
          },
          rowId: row.id,
          sectionId: surfaceBlock.props.sectionId,
          styleColor: surfaceBlock.props.domPacket.styleColor,
          valueText: row.valueText,
          width: Math.max(row.width - row.x, 0),
          x: row.x,
          y: row.y,
        },
      ];
    });
  });
}
