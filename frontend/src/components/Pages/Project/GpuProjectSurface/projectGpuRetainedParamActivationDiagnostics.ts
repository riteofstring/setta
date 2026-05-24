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
  const hostElement = findProjectGpuRetainedDomControlHostElement({
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
    domControlHost: summarizeProjectGpuRetainedDomControlHostElement({
      hostElement,
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

function findProjectGpuRetainedDomControlHostElement({
  rowId,
  surfaceId,
}: {
  readonly rowId: string;
  readonly surfaceId: string;
}): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    '[data-gpu-flow-dom-control="true"]',
  )) {
    if (
      element.dataset.gpuFlowDomControlRowId === rowId &&
      element.dataset.gpuFlowDomControlSurfaceId === surfaceId
    ) {
      return element;
    }
  }
  return null;
}

function summarizeProjectGpuRetainedDomControlHostElement({
  hostElement,
}: {
  readonly hostElement: HTMLElement | null;
}) {
  if (!hostElement) {
    return {
      hasElement: false,
    };
  }
  const rect = hostElement.getBoundingClientRect();
  return {
    active: hostElement.dataset.gpuFlowDomControlActive === "true",
    childElementCount: hostElement.childElementCount,
    clientHeight: roundChromeReproMs(hostElement.clientHeight),
    clientWidth: roundChromeReproMs(hostElement.clientWidth),
    controlId: hostElement.dataset.gpuFlowDomControlId ?? null,
    hasElement: true,
    rect: roundProjectGpuChromeReproRect({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }),
    scrollHeight: roundChromeReproMs(hostElement.scrollHeight),
    scrollWidth: roundChromeReproMs(hostElement.scrollWidth),
    textContentLength: hostElement.textContent?.length ?? 0,
  };
}
