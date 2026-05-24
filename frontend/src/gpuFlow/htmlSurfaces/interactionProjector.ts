import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";
import { HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE } from "./sourceDom";

type HtmlSurfaceInteractionProjectionInput = {
  readonly localX: number;
  readonly presentationMetadata?:
    | HtmlSurfaceInteractionPresentationMetadata
    | undefined;
  readonly localY: number;
  readonly sourceElement: HTMLElement;
  readonly sourceId: string;
  readonly surfaceX: number;
  readonly surfaceY: number;
};

type HtmlSurfaceInteractionPresentationMetadata = {
  readonly contentFrameId: string;
  readonly presentationId: string;
  readonly projectionSampleId: string;
};

type HtmlSurfaceInteractionTarget = {
  readonly localX: number;
  readonly presentationMetadata?:
    | HtmlSurfaceInteractionPresentationMetadata
    | undefined;
  readonly localY: number;
  readonly sourceElement: HTMLElement;
  readonly sourceId: string;
  readonly surfaceX: number;
  readonly surfaceY: number;
  readonly zIndex: number;
};

type HtmlSurfaceInteractionProjectionState = {
  readonly sourceElement: HTMLElement;
  readonly sourceId: string;
};

export type HtmlSurfaceInteractionProjector = {
  alignSourceToClientPoint(
    input: HtmlSurfaceInteractionProjectionInput,
  ): HtmlSurfaceInteractionProjectionState;
  clearSource(sourceId?: string | undefined): void;
  destroy(): void;
  getProjectedSourceId(): string | null;
};

type HtmlSurfaceActiveDomIslandProjection = {
  readonly display: string;
  readonly height: number;
  readonly left: number;
  readonly pointerEvents: "auto" | "none";
  readonly top: number;
  readonly transform: string;
  readonly transformOrigin: string;
  readonly width: number;
  readonly zIndex: number;
};

export { HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE } from "./sourceDom";

export const HTML_SURFACE_PASSIVE_TRANSFORM = "translate(0px, 0px) scale(1)";

export function createHtmlSurfaceInteractionProjector(): HtmlSurfaceInteractionProjector {
  let projectedState: HtmlSurfaceInteractionProjectionState | null = null;

  function clearProjectedState() {
    if (!projectedState) {
      return;
    }
    const { sourceElement } = projectedState;
    setStyleValue(sourceElement, "pointerEvents", "none");
    setStyleValue(sourceElement, "transform", HTML_SURFACE_PASSIVE_TRANSFORM);
    sourceElement.removeAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE);
    clearHtmlSurfaceInteractionPresentationMetadata(sourceElement);
    projectedState = null;
  }

  return {
    alignSourceToClientPoint(input) {
      if (
        projectedState &&
        (projectedState.sourceId !== input.sourceId ||
          projectedState.sourceElement !== input.sourceElement)
      ) {
        clearProjectedState();
      }
      const transform = `translate(${input.surfaceX - input.localX}px, ${
        input.surfaceY - input.localY
      }px)`;
      setStyleValue(input.sourceElement, "transform", transform);
      setStyleValue(input.sourceElement, "pointerEvents", "auto");
      input.sourceElement.setAttribute(
        HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE,
        "true",
      );
      const presentationMetadata =
        input.presentationMetadata ??
        getHtmlSurfaceInteractionPresentationMetadata(input.sourceElement);
      if (presentationMetadata) {
        setHtmlSurfaceInteractionPresentationMetadata({
          element: input.sourceElement,
          metadata: presentationMetadata,
        });
      } else {
        clearHtmlSurfaceInteractionPresentationMetadata(input.sourceElement);
      }
      projectedState = {
        sourceElement: input.sourceElement,
        sourceId: input.sourceId,
      };
      return projectedState;
    },
    clearSource(sourceId) {
      if (sourceId && projectedState?.sourceId !== sourceId) {
        return;
      }
      clearProjectedState();
    },
    destroy() {
      clearProjectedState();
    },
    getProjectedSourceId() {
      return projectedState?.sourceId ?? null;
    },
  };
}

export function resolveTopmostHtmlSurfaceInteractionTarget(
  targets: readonly HtmlSurfaceInteractionTarget[],
): HtmlSurfaceInteractionTarget | null {
  if (targets.length === 0) {
    return null;
  }
  return (
    [...targets].sort(
      (left, right) =>
        right.zIndex - left.zIndex ||
        right.sourceId.localeCompare(left.sourceId),
    )[0] ?? null
  );
}

export function projectHtmlSurfaceInteractionTarget({
  projector,
  target,
}: {
  readonly projector: HtmlSurfaceInteractionProjector | null;
  readonly target: HtmlSurfaceInteractionTarget | null;
}): HtmlSurfaceInteractionProjectionState | null {
  if (!projector || !target) {
    return null;
  }
  return projector.alignSourceToClientPoint({
    localX: target.localX,
    localY: target.localY,
    sourceElement: target.sourceElement,
    sourceId: target.sourceId,
    surfaceX: target.surfaceX,
    surfaceY: target.surfaceY,
    ...(target.presentationMetadata
      ? { presentationMetadata: target.presentationMetadata }
      : {}),
  });
}

function setHtmlSurfaceInteractionPresentationMetadata({
  element,
  metadata,
}: {
  readonly element: HTMLElement;
  readonly metadata: HtmlSurfaceInteractionPresentationMetadata;
}): void {
  element.dataset.gpuFlowInteractionProjectionContentFrameId =
    metadata.contentFrameId;
  element.dataset.gpuFlowInteractionProjectionPresentationId =
    metadata.presentationId;
  element.dataset.gpuFlowInteractionProjectionSampleId =
    metadata.projectionSampleId;
}

function clearHtmlSurfaceInteractionPresentationMetadata(
  element: HTMLElement,
): void {
  delete element.dataset.gpuFlowInteractionProjectionContentFrameId;
  delete element.dataset.gpuFlowInteractionProjectionPresentationId;
  delete element.dataset.gpuFlowInteractionProjectionSampleId;
}

function getHtmlSurfaceInteractionPresentationMetadata(
  element: HTMLElement,
): HtmlSurfaceInteractionPresentationMetadata | null {
  const {
    gpuFlowDomTransformContentFrameId,
    gpuFlowDomTransformPresentationId,
    gpuFlowDomTransformProjectionSampleId,
  } = element.dataset;
  if (
    !gpuFlowDomTransformContentFrameId ||
    !gpuFlowDomTransformPresentationId ||
    !gpuFlowDomTransformProjectionSampleId
  ) {
    return null;
  }
  return {
    contentFrameId: gpuFlowDomTransformContentFrameId,
    presentationId: gpuFlowDomTransformPresentationId,
    projectionSampleId: gpuFlowDomTransformProjectionSampleId,
  };
}

export function projectHtmlSurfaceActiveDomIsland({
  flowRect,
  viewport,
  zIndex,
}: {
  readonly flowRect: GpuRect;
  readonly viewport: GpuViewportInput;
  readonly zIndex: number;
}): HtmlSurfaceActiveDomIslandProjection {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const position = flowToScreenPosition(flowRect, normalizedViewport);
  return Object.freeze({
    display: "",
    height: flowRect.height,
    left: position.x,
    pointerEvents: "auto",
    top: position.y,
    transform: `scale(${normalizedViewport.zoom})`,
    transformOrigin: "top left",
    width: flowRect.width,
    zIndex,
  });
}

export function applyHtmlSurfaceActiveDomIslandProjection({
  element,
  projection,
}: {
  readonly element: HTMLElement;
  readonly projection: HtmlSurfaceActiveDomIslandProjection;
}) {
  setStyleValue(element, "display", projection.display);
  setStyleValue(element, "height", `${projection.height}px`);
  setStyleValue(element, "left", `${projection.left}px`);
  setStyleValue(element, "pointerEvents", projection.pointerEvents);
  setStyleValue(element, "top", `${projection.top}px`);
  setStyleValue(element, "transform", projection.transform);
  setStyleValue(element, "transformOrigin", projection.transformOrigin);
  setStyleValue(element, "width", `${projection.width}px`);
  setStyleValue(element, "zIndex", String(projection.zIndex));
}

export function hideHtmlSurfaceActiveDomIslandProjection(element: HTMLElement) {
  setStyleValue(element, "display", "none");
  setStyleValue(element, "pointerEvents", "none");
}

function setStyleValue(
  element: HTMLElement,
  property:
    | "display"
    | "height"
    | "left"
    | "pointerEvents"
    | "top"
    | "transform"
    | "transformOrigin"
    | "width"
    | "zIndex",
  value: string,
) {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}
