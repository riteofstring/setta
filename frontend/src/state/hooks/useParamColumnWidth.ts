import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { setSectionColumnWidth } from "openapi/http";
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
  calculateBoundedParamColumnRawWidth,
  PARAM_COLUMN_CENTER_OFFSET_PX,
} from "state/hooks/paramColumnWidthUtils";
import { getDefaultColumnWidth } from "state/hooks/columnWidthUtils";
import { useColumnWidthDrag } from "state/hooks/useColumnWidthDrag";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

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
      const columnWidth = rawWidth - PARAM_COLUMN_CENTER_OFFSET_PX;
      outerRef.current.style.setProperty(
        "--param-column-width",
        `${columnWidth}px`,
      );
    },
    [outerRef],
  );
  const persistWidth = useCallback(
    (rawWidth: number) => {
      const columnWidth = rawWidth - PARAM_COLUMN_CENTER_OFFSET_PX;
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            { columnWidth },
          );
        },
        send: (frontendOpId) =>
          callOpenAPI(
            setSectionColumnWidth({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                columnWidth,
                frontendOpId,
              },
            } as Parameters<typeof setSectionColumnWidth>[0]),
          ),
      });
    },
    [sectionId],
  );
  const getBoundedWidth = useCallback(
    (rawWidth: number, containerWidth: number) =>
      calculateBoundedParamColumnRawWidth({
        rawWidth,
        containerWidth,
        maxNestedDepth: maxNestedDepthRef.current,
      }),
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
          rawWidth = columnWidth + PARAM_COLUMN_CENTER_OFFSET_PX;
        }
        setNewWidth(containerWidth, rawWidth);
      },
      { fireImmediately: true },
    );
  }, [outerRef, sectionId, setNewWidth]);
  return handleResizeStart;
}
