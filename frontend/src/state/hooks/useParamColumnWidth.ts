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
import {
  calculateBoundedWidthWithMinRemainingWidth,
  getDefaultColumnWidth,
} from "state/hooks/columnWidthUtils";
import { useColumnWidthDrag } from "state/hooks/useColumnWidthDrag";
import { route_set_section_column_width } from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

const CENTER_OFFSET = 18;
const MIN_PARAM_VALUE_COLUMN_WIDTH = 100;

type UseParamColumnWidthArgs = {
  sectionId: string;
  outerRef: RefObject<HTMLDivElement>;
  maxNestedDepth: number;
};

export function useParamColumnWidth({
  sectionId,
  outerRef,
  maxNestedDepth,
}: UseParamColumnWidthArgs): MouseEventHandler<HTMLDivElement> {
  const maxNestedDepthRef = useRef(maxNestedDepth);

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

  const getBoundedWidth = useCallback(
    (rawWidth: number, containerWidth: number) =>
      calculateBoundedWidthWithMinRemainingWidth(
        rawWidth,
        containerWidth,
        maxNestedDepthRef.current,
        MIN_PARAM_VALUE_COLUMN_WIDTH,
      ),
    [maxNestedDepthRef],
  );

  const { handleResizeStart, setNewWidth, widthRef } = useColumnWidthDrag({
    outerRef,
    maxNestedDepthRef,
    applyWidth,
    persistWidth,
    getBoundedWidth,
  });

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
    return useProjectState.subscribe(
      (state) => {
        if (!(sectionId in state.sections)) {
          return null;
        }
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
        let rawWidth = getDefaultColumnWidth(containerWidth);
        if (columnWidth !== null && columnWidth !== undefined) {
          rawWidth = columnWidth + CENTER_OFFSET;
        }
        setNewWidth(containerWidth, rawWidth);
      },
      { fireImmediately: true },
    );
  }, [outerRef, sectionId, setNewWidth]);

  return handleResizeStart;
}
