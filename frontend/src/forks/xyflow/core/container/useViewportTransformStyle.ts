import { useLayoutEffect, useRef } from "react";
import { useReactFlow } from "../store";
import type { ReactFlowState } from "../types";

function formatViewportTransform(state: Pick<ReactFlowState, "transform">) {
  return `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`;
}

export function useViewportTransformStyleRef<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const initialTransform = formatViewportTransform(useReactFlow.getState());

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

    applyTransform();

    return useReactFlow.subscribe(
      (state) => formatViewportTransform(state),
      (nextTransform, previousTransform) => {
        if (nextTransform === previousTransform) {
          return;
        }
        applyTransform(nextTransform);
      },
    );
  }, []);

  return { initialTransform, ref };
}
