import { useLayoutEffect, useRef } from "react";
import { useReactFlow } from "../store";
import type { ReactFlowState } from "../types";

function formatViewportTransform(state: Pick<ReactFlowState, "transform">) {
  return `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`;
}

function formatViewportInteractionActive(
  state: Pick<ReactFlowState, "viewportInteractionActive">,
) {
  return state.viewportInteractionActive ? "true" : "false";
}

export function useViewportTransformStyleRef<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const initialState = useReactFlow.getState();
  const initialTransform = formatViewportTransform(initialState);
  const initialViewportInteractionActive =
    formatViewportInteractionActive(initialState);

  useLayoutEffect(() => {
    const applyTransform = (
      nextTransform = formatViewportTransform(useReactFlow.getState()),
    ) => {
      const node = ref.current;
      if (!node || node.style.transform === nextTransform) {
        return;
      }
      node.style.transform = nextTransform;
    };

    const applyViewportInteractionActive = (
      nextViewportInteractionActive = formatViewportInteractionActive(
        useReactFlow.getState(),
      ),
    ) => {
      const node = ref.current;
      if (
        !node ||
        node.dataset.viewportInteractionActive === nextViewportInteractionActive
      ) {
        return;
      }
      node.dataset.viewportInteractionActive = nextViewportInteractionActive;
    };

    applyTransform();
    applyViewportInteractionActive();

    const unsubscribeTransform = useReactFlow.subscribe(
      (state) => formatViewportTransform(state),
      (nextTransform, previousTransform) => {
        if (nextTransform === previousTransform) {
          return;
        }
        applyTransform(nextTransform);
      },
    );

    const unsubscribeViewportInteractionActive = useReactFlow.subscribe(
      (state) => formatViewportInteractionActive(state),
      (
        nextViewportInteractionActive,
        previousViewportInteractionActive,
      ) => {
        if (nextViewportInteractionActive === previousViewportInteractionActive) {
          return;
        }
        applyViewportInteractionActive(nextViewportInteractionActive);
      },
    );

    return () => {
      unsubscribeTransform();
      unsubscribeViewportInteractionActive();
    };
  }, []);

  return { initialTransform, initialViewportInteractionActive, ref };
}
