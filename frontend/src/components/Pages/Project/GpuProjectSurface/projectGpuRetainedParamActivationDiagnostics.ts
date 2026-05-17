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
    ? createProjectGpuRetainedDomControlSourceKey({ event, row, controlRect })
    : null;
  const sourceElement = findProjectGpuRetainedDomControlSourceElement({
    rowId: event.hit.ownerRowId,
    surfaceId: event.surfaceId,
  });
  postChromeReproEvent("gpu-flow-retained-dom-control-activation-preflight", {
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
    sourceElement: summarizeProjectGpuRetainedDomControlSourceElement({
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

function createProjectGpuRetainedDomControlSourceKey({
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
  const valueStyleKey = JSON.stringify({
    disabled: row.state.disabled,
    editorKind: control.editorKind,
    error: row.state.error,
    height: controlRect.height,
    language: control.policy.language,
    linePolicy: control.policy.linePolicy,
    rendererFamily: control.rendererFamily,
    width: controlRect.width,
    wrapLines: control.policy.wrapLines,
  });
  return JSON.stringify({
    defaultValue: control.defaultDisplayValue,
    disabled: row.state.disabled,
    error: row.state.error,
    language: control.policy.language,
    linePolicy: control.policy.linePolicy,
    rowId: row.id,
    sourceHeight: controlRect.height,
    sourceWidth: controlRect.width,
    surfaceId: event.surfaceId,
    value: control.displayValue,
    valueStyleKey,
    wrapLines: control.policy.wrapLines,
  });
}

function findProjectGpuRetainedDomControlSourceElement({
  rowId,
  surfaceId,
}: {
  readonly rowId: string;
  readonly surfaceId: string;
}): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    '[data-gpu-flow-retained-dom-control-source="true"]',
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

function summarizeProjectGpuRetainedDomControlSourceElement({
  expectedSourceKey,
  sourceElement,
}: {
  readonly expectedSourceKey: string | null;
  readonly sourceElement: HTMLElement | null;
}) {
  const expectedSourceKeyLength = expectedSourceKey?.length ?? null;
  if (!sourceElement) {
    return {
      expectedSourceKeyLength,
      hasElement: false,
      sourceKeyMatches: false,
    };
  }
  const rect = sourceElement.getBoundingClientRect();
  const sourceKey =
    sourceElement.dataset.gpuFlowRetainedDomControlSourceKey ?? "";
  const sourceKeyMatches = isProjectGpuRetainedDomControlSourceKeyMatch({
    expectedSourceKey,
    sourceKey,
  });
  return {
    childElementCount: sourceElement.childElementCount,
    clientHeight: roundChromeReproMs(sourceElement.clientHeight),
    clientWidth: roundChromeReproMs(sourceElement.clientWidth),
    datasetSourceKeyLength: sourceKey.length,
    expectedSourceKeyLength,
    hasElement: true,
    rect: roundProjectGpuChromeReproRect({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }),
    scrollHeight: roundChromeReproMs(sourceElement.scrollHeight),
    scrollWidth: roundChromeReproMs(sourceElement.scrollWidth),
    sourceKeyMatches,
    textContentLength: sourceElement.textContent?.length ?? 0,
  };
}

function isProjectGpuRetainedDomControlSourceKeyMatch({
  expectedSourceKey,
  sourceKey,
}: {
  readonly expectedSourceKey: string | null;
  readonly sourceKey: string;
}): boolean {
  return expectedSourceKey !== null && sourceKey === expectedSourceKey;
}
