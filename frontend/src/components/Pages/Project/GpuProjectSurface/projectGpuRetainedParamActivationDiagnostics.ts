import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedContentRowControlRect } from "gpuFlow/retainedContentRowLayout";
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "gpuFlow/retainedContentSceneSourceMetadata";
import type { GpuRect } from "gpuFlow/viewportMath";
import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import {
  createProjectGpuCanvasInkProbeAtClientPoint,
  roundProjectGpuChromeReproRect,
} from "./projectGpuChromeReproCanvasProbe";

export function postProjectGpuRetainedParamActivationPreflightChromeReproEvent(
  event: GpuRetainedContentInteractionEvent,
) {
  if (!isChromeReproActive()) {
    return;
  }
  const row = getProjectGpuRetainedParamActivationRow(event);
  const controlRect = row
    ? createProjectGpuRetainedParamActivationControlRect(event, row)
    : null;
  const sourceKey = row
    ? createProjectGpuRetainedTextLikeSourceKey({ event, row, controlRect })
    : null;
  const sourceElement = findProjectGpuRetainedTextLikeSnapshotSourceElement({
    rowId: event.hit.ownerRowId,
    surfaceId: event.surfaceId,
  });
  postChromeReproEvent("gpu-flow-retained-text-like-row-activation-preflight", {
    canvasProbeAtPointer: createProjectGpuCanvasInkProbeAtClientPoint({
      clientPoint: {
        x: event.nativeEvent.clientX,
        y: event.nativeEvent.clientY,
      },
      target: event.nativeEvent.target,
    }),
    clientPoint: {
      x: roundChromeReproMs(event.nativeEvent.clientX),
      y: roundChromeReproMs(event.nativeEvent.clientY),
    },
    controlRect: controlRect
      ? roundProjectGpuChromeReproRect(controlRect)
      : null,
    hit: {
      id: event.hit.id,
      kind: event.hit.kind,
      ownerRowId: event.hit.ownerRowId,
      rect: roundProjectGpuChromeReproRect(event.hit.rect),
    },
    localPoint: {
      x: roundChromeReproMs(event.localPoint.x),
      y: roundChromeReproMs(event.localPoint.y),
    },
    ownerSectionId: event.ownerSectionId,
    row: row ? summarizeProjectGpuRetainedParamActivationRow(row) : null,
    screenPoint: {
      x: roundChromeReproMs(event.screenPoint.x),
      y: roundChromeReproMs(event.screenPoint.y),
    },
    sourceElement: summarizeProjectGpuRetainedTextLikeSnapshotSourceElement({
      expectedSourceKey: sourceKey,
      sourceElement,
    }),
    surfaceId: event.surfaceId,
  });
}

function getProjectGpuRetainedParamActivationRow(
  event: GpuRetainedContentInteractionEvent,
): GpuRetainedContentRow | null {
  return (
    event.retainedScene.rows.find((row) => row.id === event.hit.ownerRowId) ??
    null
  );
}

function createProjectGpuRetainedParamActivationControlRect(
  event: GpuRetainedContentInteractionEvent,
  row: GpuRetainedContentRow,
): GpuRect | null {
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    event.retainedScene,
  );
  if (!sourceInput) {
    return null;
  }
  return createGpuRetainedContentRowControlRect({
    controlWidth: sourceInput.controlWidth,
    indentWidth: sourceInput.indentWidth,
    rightInset: sourceInput.controlRightInset,
    rowDepth: row.depth,
    rowRect: row.projectedRect,
  });
}

function summarizeProjectGpuRetainedParamActivationRow(
  row: GpuRetainedContentRow,
) {
  const control = row.control;
  return {
    control:
      control?.kind === "text-like"
        ? {
            codeLength: control.displayValue.length,
            commitPolicy: control.commitPolicy,
            defaultValueLength: control.defaultDisplayValue.length,
            editorKind: control.editorKind,
            language: control.policy.language ?? "plain",
            linePolicy: control.policy.linePolicy,
            maxVisibleLines: control.policy.maxVisibleLines,
            minVisibleLines: control.policy.minVisibleLines,
            rendererFamily: control.rendererFamily,
            valuePreview: control.displayValue.slice(0, 120),
            wrapLines: control.policy.wrapLines,
          }
        : control
          ? {
              commitPolicy: control.commitPolicy,
              kind: control.kind,
              rendererFamily: control.rendererFamily,
            }
          : null,
    controlKind: row.controlKind,
    depth: row.depth,
    index: row.index,
    label: row.label,
    projectedRect: roundProjectGpuChromeReproRect(row.projectedRect),
    rowId: row.id,
    state: row.state,
    visualProjectedRect: roundProjectGpuChromeReproRect(
      row.visualProjectedRect,
    ),
  };
}

function createProjectGpuRetainedTextLikeSourceKey({
  controlRect,
  event,
  row,
}: {
  readonly controlRect: GpuRect | null;
  readonly event: GpuRetainedContentInteractionEvent;
  readonly row: GpuRetainedContentRow;
}): string | null {
  const control = row.control;
  if (control?.kind !== "text-like" || !controlRect) {
    return null;
  }
  return JSON.stringify({
    code: control.displayValue,
    defaultValue: control.defaultDisplayValue,
    disabled: row.state.disabled,
    error: row.state.error,
    language: control.policy.language,
    linePolicy: control.policy.linePolicy,
    rowId: row.id,
    sourceHeight: controlRect.height,
    sourceWidth: controlRect.width,
    surfaceId: event.surfaceId,
    wrapLines: control.policy.wrapLines,
  });
}

function findProjectGpuRetainedTextLikeSnapshotSourceElement({
  rowId,
  surfaceId,
}: {
  readonly rowId: string;
  readonly surfaceId: string;
}): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    '[data-gpu-flow-retained-text-like-row-snapshot-source="true"]',
  )) {
    if (
      element.dataset.gpuFlowRetainedRowId === rowId &&
      element.dataset.gpuFlowRetainedSurfaceId === surfaceId
    ) {
      return element;
    }
  }
  return null;
}

function summarizeProjectGpuRetainedTextLikeSnapshotSourceElement({
  expectedSourceKey,
  sourceElement,
}: {
  readonly expectedSourceKey: string | null;
  readonly sourceElement: HTMLElement | null;
}) {
  if (!sourceElement) {
    return {
      expectedSourceKeyLength: expectedSourceKey?.length ?? null,
      hasElement: false,
      sourceKeyMatches: false,
    };
  }
  const rect = sourceElement.getBoundingClientRect();
  const sourceKey =
    sourceElement.dataset.gpuFlowRetainedTextLikeRowSnapshotSourceKey ?? "";
  return {
    childElementCount: sourceElement.childElementCount,
    clientHeight: roundChromeReproMs(sourceElement.clientHeight),
    clientWidth: roundChromeReproMs(sourceElement.clientWidth),
    datasetSourceKeyLength: sourceKey.length,
    expectedSourceKeyLength: expectedSourceKey?.length ?? null,
    hasElement: true,
    rect: roundProjectGpuChromeReproRect({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }),
    scrollHeight: roundChromeReproMs(sourceElement.scrollHeight),
    scrollWidth: roundChromeReproMs(sourceElement.scrollWidth),
    sourceKeyMatches:
      expectedSourceKey !== null && sourceKey === expectedSourceKey,
    textContentLength: sourceElement.textContent?.length ?? 0,
  };
}
