import { localStorageFns } from "state/hooks/localStorageHooks";
import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { useReactFlow } from "../store";
import { devWarn, getDimensions } from "../utils";

function useResizeHandler(
  rendererNode: MutableRefObject<HTMLDivElement | null>,
): void {
  const [overviewWidth] = localStorageFns.overviewTrueWidth.hook();
  const [uiEditorWidth] = localStorageFns.uiEditorTrueWidth.hook();

  useEffect(() => {
    let resizeObserver: ResizeObserver;

    const updateDimensions = () => {
      if (!rendererNode.current) {
        return;
      }

      const size = getDimensions(rendererNode.current);

      if (size.height === 0 || size.width === 0) {
        devWarn(
          "004",
          "The React Flow parent container needs a width and a height to render the graph.",
        );
      }

      useReactFlow.setState({
        width: size.width - overviewWidth - uiEditorWidth || 500,
        height: size.height || 500,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    if (rendererNode.current) {
      resizeObserver = new ResizeObserver(() => updateDimensions());
      resizeObserver.observe(rendererNode.current);
    }

    return () => {
      window.removeEventListener("resize", updateDimensions);

      if (resizeObserver && rendererNode.current) {
        resizeObserver.unobserve(rendererNode.current!);
      }
    };
  }, [overviewWidth, uiEditorWidth]);
}

export default useResizeHandler;
