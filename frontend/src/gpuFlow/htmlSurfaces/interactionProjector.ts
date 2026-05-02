export type HtmlSurfaceInteractionProjectionInput = {
  readonly localX: number;
  readonly localY: number;
  readonly sourceElement: HTMLElement;
  readonly sourceId: string;
  readonly surfaceX: number;
  readonly surfaceY: number;
};

export type HtmlSurfaceInteractionProjectionState = {
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

export const HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE =
  "data-gpu-flow-projected-interaction";

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

function setStyleValue(
  element: HTMLElement,
  property: "pointerEvents" | "transform",
  value: string,
) {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}
