import { useReactFlow } from "forks/xyflow/core/store";
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEventHandler,
  type RefObject,
} from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_set_section_column_width } from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { clamp } from "utils/utils";

const CENTER_OFFSET = 18;

type ParamColumnWidthState = {
  currentWidth: number;
  containerWidth: number;
  currentPercentage: number;
  isDragging: boolean;
};

type DragListeners = {
  move: ((event: MouseEvent) => void) | null;
  up: (() => void) | null;
};

type UseParamColumnWidthArgs = {
  sectionId: string;
  outerRef: RefObject<HTMLDivElement>;
  maxNestedDepth: number;
};

function getMarginPx(maxNestedDepth: number) {
  return 72 + Math.max(0, 12 * (maxNestedDepth - 1));
}

function calculateBoundedWidth(
  width: number,
  containerWidth: number,
  maxNestedDepth: number,
) {
  const marginPx = getMarginPx(maxNestedDepth);
  return clamp(width, marginPx, containerWidth - marginPx);
}

export function useParamColumnWidth({
  sectionId,
  outerRef,
  maxNestedDepth,
}: UseParamColumnWidthArgs): MouseEventHandler<HTMLDivElement> {
  const widthRef = useRef<ParamColumnWidthState>({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50,
    isDragging: false,
  });
  const maxNestedDepthRef = useRef(maxNestedDepth);
  const rafRef = useRef<number | null>(null);
  const dragListenersRef = useRef<DragListeners>({ move: null, up: null });

  const applyWidth = useCallback(
    (rawWidth: number) => {
      if (!outerRef.current) {
        return;
      }
      const columnWidth = rawWidth - CENTER_OFFSET;
      outerRef.current.style.setProperty(
        "--param-column-width",
        `${columnWidth}px`,
      );
    },
    [outerRef],
  );

  const setNewWidth = useCallback(
    (containerWidth: number, rawWidth: number) => {
      if (!containerWidth) {
        return;
      }
      const boundedWidth = calculateBoundedWidth(
        rawWidth,
        containerWidth,
        maxNestedDepthRef.current,
      );
      widthRef.current.currentWidth = boundedWidth;
      widthRef.current.containerWidth = containerWidth;
      widthRef.current.currentPercentage = (boundedWidth / containerWidth) * 100;
      applyWidth(boundedWidth);
    },
    [applyWidth],
  );

  const persistWidth = useCallback(
    (rawWidth: number) => {
      const columnWidth = rawWidth - CENTER_OFFSET;
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            { columnWidth },
          );
        },
        send: (frontendOpId) =>
          route_set_section_column_width({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            columnWidth,
            frontendOpId,
          }),
      });
    },
    [sectionId],
  );

  const updatedWidthOnContainerResize = useCallback(() => {
    if (widthRef.current.isDragging || !outerRef.current) {
      return;
    }
    const containerWidth = outerRef.current.clientWidth;
    if (!containerWidth) {
      return;
    }
    const newWidth = (containerWidth * widthRef.current.currentPercentage) / 100;
    setNewWidth(containerWidth, newWidth);
  }, [outerRef, setNewWidth]);

  useEffect(() => {
    maxNestedDepthRef.current = maxNestedDepth;
    if (!outerRef.current || widthRef.current.currentWidth === 0) {
      return;
    }
    const containerWidth = outerRef.current.clientWidth;
    if (!containerWidth) {
      return;
    }
    setNewWidth(containerWidth, widthRef.current.currentWidth);
  }, [maxNestedDepth, outerRef, setNewWidth]);

  useEffect(() => {
    let previousWidth = outerRef.current?.clientWidth;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const newWidth =
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;

      if (newWidth !== previousWidth) {
        previousWidth = newWidth;
        updatedWidthOnContainerResize();
      }
    });

    if (outerRef.current) {
      resizeObserver.observe(outerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [outerRef, updatedWidthOnContainerResize]);

  useEffect(() => {
    return useProjectState.subscribe(
      (state) => {
        const impl = getCurrEffectiveSectionImplWithTypeGuard(
          state,
          sectionId,
          isBaseSectionWithParamsImpl,
        );
        return impl.columnWidth ?? null;
      },
      (columnWidth) => {
        if (widthRef.current.isDragging || !outerRef.current) {
          return;
        }
        const containerWidth = outerRef.current.clientWidth;
        if (!containerWidth) {
          return;
        }
        let rawWidth = containerWidth / 2;
        if (columnWidth !== null && columnWidth !== undefined) {
          rawWidth = columnWidth + CENTER_OFFSET;
        }
        setNewWidth(containerWidth, rawWidth);
      },
      { fireImmediately: true },
    );
  }, [outerRef, sectionId, setNewWidth]);

  useEffect(() => {
    return () => {
      if (dragListenersRef.current.move) {
        window.removeEventListener("mousemove", dragListenersRef.current.move);
      }
      if (dragListenersRef.current.up) {
        window.removeEventListener("mouseup", dragListenersRef.current.up);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleResizeStart: MouseEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      event.preventDefault();
      const container = outerRef.current;
      if (!container) {
        return;
      }
      const containerWidth = container.clientWidth;
      if (!containerWidth) {
        return;
      }
      widthRef.current.containerWidth = containerWidth;

      if (widthRef.current.currentWidth === 0) {
        setNewWidth(containerWidth, containerWidth / 2);
      }

      if (event.detail === 2) {
        widthRef.current.isDragging = false;
        widthRef.current.currentPercentage = 50;
        const rawWidth = containerWidth / 2;
        setNewWidth(containerWidth, rawWidth);
        persistWidth(rawWidth);
        return;
      }

      const startX = event.clientX;
      const startWidth = widthRef.current.currentWidth;
      widthRef.current.isDragging = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
          const diff =
            (moveEvent.clientX - startX) / useReactFlow.getState().transform[2];
          const newWidth = startWidth + diff;
          const boundedWidth = calculateBoundedWidth(
            newWidth,
            containerWidth,
            maxNestedDepthRef.current,
          );
          widthRef.current.currentWidth = boundedWidth;
          applyWidth(boundedWidth);
          rafRef.current = null;
        });
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        dragListenersRef.current = { move: null, up: null };

        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        const finalWidth = widthRef.current.currentWidth;
        if (widthRef.current.containerWidth) {
          widthRef.current.currentPercentage =
            (finalWidth / widthRef.current.containerWidth) * 100;
        }
        widthRef.current.isDragging = false;
        persistWidth(finalWidth);
      };

      dragListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [applyWidth, outerRef, persistWidth, setNewWidth],
  );

  return handleResizeStart;
}
