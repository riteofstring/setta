import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type { GpuRetainedContentDrawCommand } from "../retainedContentScene";
import type {
  RetainedTextLikePreviewPageFrameSurface,
  RetainedTextLikePreviewPagePreparedFrame,
} from "../retainedTextLikePreviewPageManager";
import type { RetainedTexturePageDescriptor } from "../retainedTexturePages";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";

let lastRetainedContentVisualStateSignature: string | null = null;
let lastRetainedTextLikePreviewSignature: string | null = null;

export function postGpuFlowRetainedContentVisualStateChromeReproEvent({
  frame,
  scene,
}: {
  readonly frame: number;
  readonly scene: GpuFlowScene | undefined;
}) {
  if (!isChromeReproActive() || !scene) {
    return;
  }
  const surfaces = scene.contentSurfaces
    .map(createGpuFlowRetainedContentSurfaceVisualState)
    .filter(
      (surface): surface is NonNullable<typeof surface> => surface !== null,
    );
  if (surfaces.length === 0) {
    return;
  }
  const signature = JSON.stringify(surfaces);
  if (signature === lastRetainedContentVisualStateSignature) {
    return;
  }
  lastRetainedContentVisualStateSignature = signature;
  postChromeReproEvent("gpu-flow-retained-content-visual-state", {
    frame,
    surfaces,
  });
}

export function postGpuFlowRetainedTextLikePreviewChromeReproEvent({
  frame,
  preparedFrame,
  previewSurfaces,
}: {
  readonly frame: number;
  readonly preparedFrame: RetainedTextLikePreviewPagePreparedFrame;
  readonly previewSurfaces: readonly RetainedTextLikePreviewPageFrameSurface[];
}) {
  if (!isChromeReproActive() || preparedFrame.sourceCount === 0) {
    return;
  }
  const state = {
    baseDrawQuads: preparedFrame.baseDrawQuads.slice(0, 24).map((quad) => ({
      desiredDescriptor: summarizeRetainedTexturePageDescriptor(
        quad.desiredDescriptor,
      ),
      fallback: quad.fallback,
      pageDescriptor: summarizeRetainedTexturePageDescriptor(
        quad.page.descriptor,
      ),
      sampleRectCss: roundGpuFlowChromeReproRect(quad.sampleRectCss),
      staleContent: quad.staleContent,
    })),
    drawQuadCount: preparedFrame.drawQuadCount,
    missingPageCount: preparedFrame.missingPageCount,
    omittedPreviewCount: preparedFrame.omittedPreviewCount,
    previewSurfaces: previewSurfaces.slice(0, 24).map((surface) => ({
      layoutTextureSourceRect: roundGpuFlowChromeReproRect(
        surface.layout.textureSourceRect,
      ),
      sourceId: surface.sourceId,
      sourceKeyLength: surface.sourceKey.length,
      sourceWindowCss: roundGpuFlowChromeReproRect(surface.sourceWindowCss),
      surfaceId: surface.surfaceId,
      visibleSourceRectCss: roundGpuFlowChromeReproRect(
        surface.visibleSourceRectCss,
      ),
      zIndex: surface.layout.zIndex ?? 0,
    })),
    sourceCount: preparedFrame.sourceCount,
    targetDescriptors: preparedFrame.targetDescriptors
      .slice(0, 24)
      .map(summarizeRetainedTexturePageDescriptor),
    targetDescriptorCount: preparedFrame.targetDescriptors.length,
  };
  const signature = JSON.stringify(state);
  if (signature === lastRetainedTextLikePreviewSignature) {
    return;
  }
  lastRetainedTextLikePreviewSignature = signature;
  postChromeReproEvent("gpu-flow-retained-text-like-preview-pages", {
    frame,
    ...state,
  });
}

function createGpuFlowRetainedContentSurfaceVisualState(
  surface: GpuContentSurface,
): {
  readonly contentRect: GpuRect;
  readonly rect: GpuRect;
  readonly scrollbars: readonly {
    readonly axis: string;
    readonly state: unknown;
    readonly thumbRect: GpuRect;
    readonly trackRect: GpuRect;
  }[];
  readonly scrollOffset: { readonly x: number; readonly y: number };
  readonly surfaceId: string;
  readonly switches: readonly {
    readonly checked: boolean;
    readonly displayValue: string;
    readonly rect: GpuRect;
    readonly rowId: string;
  }[];
  readonly textLikeRows: readonly {
    readonly defaultDisplayValue: string;
    readonly displayValue: string;
    readonly editorKind: string;
    readonly linePolicy: string;
    readonly nativeControlActive: boolean;
    readonly rect: GpuRect;
    readonly rowId: string;
    readonly rowLabel: string;
    readonly rowRect: GpuRect;
    readonly wrapLines: boolean;
  }[];
  readonly viewportRect: GpuRect;
  readonly zIndex: number;
} | null {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return null;
  }
  const rowById = new Map(retainedScene.rows.map((row) => [row.id, row]));
  const switches = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentSwitchVisualState)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  const textLikeRows = retainedScene.drawCommands
    .map((command) =>
      createGpuFlowRetainedContentTextLikeVisualState({ command, rowById }),
    )
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  const scrollbars = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentScrollbarVisualState)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  if (
    switches.length === 0 &&
    scrollbars.length === 0 &&
    textLikeRows.length === 0
  ) {
    return null;
  }
  return {
    contentRect: roundGpuFlowChromeReproRect(retainedScene.contentRect),
    rect: roundGpuFlowChromeReproRect(surface.rect),
    scrollbars,
    scrollOffset: {
      x: roundChromeReproMs(retainedScene.scrollOffset.x),
      y: roundChromeReproMs(retainedScene.scrollOffset.y),
    },
    surfaceId: surface.id,
    switches,
    textLikeRows,
    viewportRect: roundGpuFlowChromeReproRect(retainedScene.viewportRect),
    zIndex: surface.zIndex,
  };
}

function createGpuFlowRetainedContentTextLikeVisualState({
  command,
  rowById,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly rowById: ReadonlyMap<
    string,
    NonNullable<GpuContentSurface["retainedScene"]>["rows"][number]
  >;
}): {
  readonly defaultDisplayValue: string;
  readonly displayValue: string;
  readonly editorKind: string;
  readonly linePolicy: string;
  readonly nativeControlActive: boolean;
  readonly rect: GpuRect;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly rowRect: GpuRect;
  readonly wrapLines: boolean;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "text-like") {
    return null;
  }
  const row = rowById.get(command.rowId);
  return {
    defaultDisplayValue: command.control.defaultDisplayValue,
    displayValue: command.control.displayValue,
    editorKind: command.control.editorKind,
    linePolicy: command.control.policy.linePolicy,
    nativeControlActive: row?.state.nativeControlActive ?? false,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
    rowLabel: row?.label ?? "",
    rowRect: row
      ? roundGpuFlowChromeReproRect(row.projectedRect)
      : { height: 0, width: 0, x: 0, y: 0 },
    wrapLines: command.control.policy.wrapLines,
  };
}

function createGpuFlowRetainedContentSwitchVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly checked: boolean;
  readonly displayValue: string;
  readonly rect: GpuRect;
  readonly rowId: string;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "switch") {
    return null;
  }
  return {
    checked: command.control.checked,
    displayValue: command.control.displayValue,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
  };
}

function createGpuFlowRetainedContentScrollbarVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly axis: string;
  readonly state: unknown;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
} | null {
  if (command.kind !== "scrollbar") {
    return null;
  }
  return {
    axis: command.axis,
    state: command.state ?? null,
    thumbRect: roundGpuFlowChromeReproRect(command.thumbRect),
    trackRect: roundGpuFlowChromeReproRect(command.trackRect),
  };
}

function summarizeRetainedTexturePageDescriptor(
  descriptor: RetainedTexturePageDescriptor,
): {
  readonly contentVersion: number;
  readonly lodLevel: number;
  readonly lodScale: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sourceRectCss: GpuRect;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly tileColumn: number;
  readonly tileRow: number;
} {
  return {
    contentVersion: descriptor.contentVersion,
    lodLevel: descriptor.lodLevel,
    lodScale: roundChromeReproMs(descriptor.lodScale),
    pixelHeight: descriptor.pixelHeight,
    pixelWidth: descriptor.pixelWidth,
    sourceRectCss: roundGpuFlowChromeReproRect(descriptor.sourceRectCss),
    sourceWindowCss: roundGpuFlowChromeReproRect(descriptor.sourceWindowCss),
    surfaceId: descriptor.surfaceId,
    tileColumn: descriptor.tileColumn,
    tileRow: descriptor.tileRow,
  };
}

function roundGpuFlowChromeReproRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}
