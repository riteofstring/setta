import {
  useCallback,
  useEffect,
  useRef,
  type MouseEventHandler,
  type RefObject,
} from "react";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { setCurrEffectiveSectionImplValue } from "state/actions/sectionEffectiveImplMutations";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { getDefaultColumnWidth } from "state/hooks/columnWidthUtils";
import { useColumnWidthDrag } from "state/hooks/useColumnWidthDrag";
import { route_set_browser_column_widths } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type BrowserColumnWidthKey = "columnWidth" | "typesColumnWidth";

type UseBrowserColumnWidthArgs = {
  sectionId: string;
  outerRef: RefObject<HTMLDivElement>;
  widthKey: BrowserColumnWidthKey;
  cssVarName: string;
  getBoundedWidth?: (width: number, containerWidth: number) => number;
  getDefaultWidth?: (containerWidth: number) => number;
};

export function useBrowserColumnWidth({
  sectionId,
  outerRef,
  widthKey,
  cssVarName,
  getBoundedWidth,
  getDefaultWidth,
}: UseBrowserColumnWidthArgs): MouseEventHandler<HTMLDivElement> {
  const maxNestedDepthRef = useRef(1);
  const widthsRef = useRef<{
    columnWidth: number | null;
    typesColumnWidth: number | null;
  }>({
    columnWidth: null,
    typesColumnWidth: null,
  });

  const applyWidth = useCallback(
    (width: number) => {
      if (!outerRef.current) {
        return;
      }
      outerRef.current.style.setProperty(cssVarName, `${width}px`);
    },
    [cssVarName, outerRef],
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

  const { handleResizeStart, setNewWidth, widthRef } = useColumnWidthDrag({
    outerRef,
    maxNestedDepthRef,
    applyWidth,
    persistWidth,
    getBoundedWidth,
  });

  useEffect(() => {
    return useProjectState.subscribe(
      (state) => {
        if (!(sectionId in state.sections)) {
          return { columnWidth: null, typesColumnWidth: null };
        }
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
        let rawWidth = getDefaultWidth
          ? getDefaultWidth(containerWidth)
          : getDefaultColumnWidth(containerWidth);
        if (columnWidth !== null && columnWidth !== undefined) {
          rawWidth = columnWidth;
        }
        setNewWidth(containerWidth, rawWidth);
      },
      { fireImmediately: true },
    );
  }, [getDefaultWidth, outerRef, sectionId, setNewWidth, widthKey]);

  return handleResizeStart;
}
