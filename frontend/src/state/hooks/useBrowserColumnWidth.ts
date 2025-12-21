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
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  calculateBoundedWidth,
  getDefaultColumnWidth,
} from "state/hooks/columnWidthUtils";
import { route_set_browser_column_widths } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type DragListeners = {
  move: ((event: MouseEvent) => void) | null;
  up: (() => void) | null;
};

type BrowserColumnWidthKey = "columnWidth" | "typesColumnWidth";

type UseBrowserColumnWidthArgs = {
  sectionId: string;
  outerRef: RefObject<HTMLDivElement>;
  widthKey: BrowserColumnWidthKey;
  cssVarName: string;
};

export function useBrowserColumnWidth({
  sectionId,
  outerRef,
  widthKey,
  cssVarName,
}: UseBrowserColumnWidthArgs): MouseEventHandler<HTMLDivElement> {
  const maxNestedDepth = 1;
  const widthsRef = useRef<{
    columnWidth: number | null;
    typesColumnWidth: number | null;
  }>({
    columnWidth: null,
    typesColumnWidth: null,
  });
  const widthRef = useRef({
    currentWidth: 0,
    containerWidth: 0,
    currentPercentage: 50,
    isDragging: false,
  });
  const rafRef = useRef<number | null>(null);
  const dragListenersRef = useRef<DragListeners>({ move: null, up: null });

  const applyWidth = useCallback(
    (width: number) => {
      if (!outerRef.current) {
        return;
      }
      outerRef.current.style.setProperty(cssVarName, `${width}px`);
    },
    [cssVarName, outerRef],
  );

  const setNewWidth = useCallback(
    (containerWidth: number, rawWidth: number) => {
      if (!containerWidth) {
        return;
      }
      const boundedWidth = calculateBoundedWidth(
        rawWidth,
        containerWidth,
        maxNestedDepth,
      );
      widthRef.current.currentWidth = boundedWidth;
      widthRef.current.containerWidth = containerWidth;
      widthRef.current.currentPercentage = (boundedWidth / containerWidth) * 100;
      applyWidth(boundedWidth);
    },
    [applyWidth, maxNestedDepth],
  );

  const persistWidth = useCallback(
    (width: number) => {
      const nextWidths = { ...widthsRef.current };
      if (widthKey === "typesColumnWidth") {
        nextWidths.typesColumnWidth = width;
      } else {
        nextWidths.columnWidth = width;
      }
      widthsRef.current = nextWidths;
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BrowserSection">(
            state,
            sectionId,
            nextWidths,
          );
        },
        send: (frontendOpId) =>
          route_set_browser_column_widths({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            columnWidth: nextWidths.columnWidth,
            typesColumnWidth: nextWidths.typesColumnWidth,
            frontendOpId,
          }),
      });
    },
    [sectionId, widthKey],
  );

  useEffect(() => {
    let previousWidth = outerRef.current?.clientWidth;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const newWidth =
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;

      if (newWidth !== previousWidth) {
        previousWidth = newWidth;
        if (widthRef.current.isDragging || !outerRef.current) {
          return;
        }
        const containerWidth = outerRef.current.clientWidth;
        if (!containerWidth) {
          return;
        }
        const newColumnWidth =
          (containerWidth * widthRef.current.currentPercentage) / 100;
        setNewWidth(containerWidth, newColumnWidth);
      }
    });

    if (outerRef.current) {
      resizeObserver.observe(outerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [outerRef, setNewWidth]);

  useEffect(() => {
    return useProjectState.subscribe(
      (state) => {
        const impl = getCurrEffectiveSectionImplOfType(
          state,
          sectionId,
          SectionTypeEnum.Browser,
        );
        return {
          columnWidth: impl.columnWidth ?? null,
          typesColumnWidth: impl.typesColumnWidth ?? null,
        };
      },
      (nextWidths) => {
        widthsRef.current = nextWidths;
        if (widthRef.current.isDragging || !outerRef.current) {
          return;
        }
        const containerWidth = outerRef.current.clientWidth;
        if (!containerWidth) {
          return;
        }
        const columnWidth =
          widthKey === "typesColumnWidth"
            ? nextWidths.typesColumnWidth
            : nextWidths.columnWidth;
        let rawWidth = getDefaultColumnWidth(containerWidth);
        if (columnWidth !== null && columnWidth !== undefined) {
          rawWidth = columnWidth;
        }
        setNewWidth(containerWidth, rawWidth);
      },
      { fireImmediately: true },
    );
  }, [outerRef, sectionId, setNewWidth, widthKey]);

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
      if (!outerRef.current) {
        return;
      }
      const containerWidth = outerRef.current.clientWidth;
      if (!containerWidth) {
        return;
      }
      widthRef.current.containerWidth = containerWidth;
      if (widthRef.current.currentWidth === 0) {
        setNewWidth(containerWidth, getDefaultColumnWidth(containerWidth));
      }
      if (event.detail === 2) {
        widthRef.current.isDragging = false;
        const rawWidth = getDefaultColumnWidth(containerWidth);
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
          const delta =
            (moveEvent.clientX - startX) / useReactFlow.getState().transform[2];
          const newWidth = startWidth + delta;
          const boundedWidth = calculateBoundedWidth(
            newWidth,
            containerWidth,
            maxNestedDepth,
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
    [applyWidth, maxNestedDepth, outerRef, persistWidth, setNewWidth],
  );

  return handleResizeStart;
}
