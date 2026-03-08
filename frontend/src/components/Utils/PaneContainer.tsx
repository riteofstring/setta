import {
  getPaneMaxWidthForViewport,
  getPaneMinimumWidth,
  getPaneTrueWidthFromLayoutState,
  normalizePaneWidthForViewportChange,
  setPaneWidthWithLayout,
  togglePaneFullWidth,
} from "components/Panes/paneLayout";
import { Resizable } from "re-resizable";
import { useEffect, useRef } from "react";
import { RiExpandDiagonalLine } from "react-icons/ri";
import { useWindowSize } from "state/hooks/utils";
import {
  APP_PANE_Z_INDEX_CLASS_NAME,
  CLOSED_PANE_WIDTH,
  PaneName,
} from "utils/constants";
import { clamp } from "utils/utils";

const FULL_WIDTH_BORDER_EPSILON = 2;

function getPaneWidthDiff({
  paneName,
  previous,
  next,
}: {
  paneName: PaneName;
  previous: Parameters<typeof getPaneTrueWidthFromLayoutState>[0];
  next: Parameters<typeof getPaneTrueWidthFromLayoutState>[0];
}): number {
  return (
    getPaneTrueWidthFromLayoutState(next, paneName) -
    getPaneTrueWidthFromLayoutState(previous, paneName)
  );
}

export function PaneContainer({
  paneName,
  right,
  children,
  minimumWidth,
  vis,
  width,
  onResizeStop,
  paddingClassName,
}: {
  paneName: PaneName;
  right: boolean;
  children: React.ReactNode;
  minimumWidth: number;
  vis: boolean;
  width: number;
  onResizeStop?: (widthDiff: number) => void;
  paddingClassName?: string;
}) {
  const size = useWindowSize();
  const viewportWidth = size.winWidth ?? 0;
  const maxWidth =
    viewportWidth > 0 ? getPaneMaxWidthForViewport(viewportWidth) : 100000;
  const baselineMinimum = getPaneMinimumWidth(paneName);
  const effectiveMinimumWidth = Math.max(baselineMinimum, minimumWidth);
  const minWidth = Math.min(effectiveMinimumWidth, maxWidth);
  const previousViewportWidthRef = useRef<number | null>(null);

  useEffect(() => {
    if (viewportWidth <= 0) {
      return;
    }
    if (!vis) {
      previousViewportWidthRef.current = viewportWidth;
      return;
    }
    const previousViewportWidth =
      previousViewportWidthRef.current ?? viewportWidth;
    previousViewportWidthRef.current = viewportWidth;
    const normalizedWidth = normalizePaneWidthForViewportChange({
      paneName,
      width,
      viewportWidth,
      previousViewportWidth,
    });
    if (normalizedWidth !== width) {
      const { previous, next } = setPaneWidthWithLayout(
        paneName,
        normalizedWidth,
      );
      if (onResizeStop) {
        onResizeStop(
          getPaneWidthDiff({
            paneName,
            previous,
            next,
          }),
        );
      }
    }
  }, [maxWidth, minWidth, onResizeStop, paneName, viewportWidth, vis, width]);

  function localOnResizeStop(_e, _direction, _ref, d) {
    const requestedWidth = clamp(width + d.width, minWidth, maxWidth);
    if (requestedWidth === width) {
      return;
    }
    const { previous, next } = setPaneWidthWithLayout(paneName, requestedWidth);
    if (onResizeStop) {
      onResizeStop(
        getPaneWidthDiff({
          paneName,
          previous,
          next,
        }),
      );
    }
  }

  const style = `${!right ? "-" : ""}${width - CLOSED_PANE_WIDTH}px`;
  const isFullWidth = vis && width >= maxWidth - FULL_WIDTH_BORDER_EPSILON;
  const seamBorderClass = right
    ? isFullWidth
      ? "border-l-0"
      : "border-l"
    : isFullWidth
      ? "border-r-0"
      : "border-r";

  const rightCondition = right
    ? `justify-self-end left-auto pr-7 ${seamBorderClass}`
    : `justify-self-start right-auto pl-9 ${seamBorderClass}`;
  const paddingClasses = paddingClassName ?? "py-2.5";
  const fullscreenButtonPositionClass = right
    ? "left-2 top-2"
    : "right-2 top-2";

  function onExpandToFullWidth() {
    const { previous, next } = togglePaneFullWidth(paneName);
    if (onResizeStop) {
      onResizeStop(
        getPaneWidthDiff({
          paneName,
          previous,
          next,
        }),
      );
    }
  }

  return (
    <Resizable
      size={{ width, height: "100%" }}
      as="aside"
      onResizeStop={localOnResizeStop}
      maxWidth={maxWidth}
      minWidth={minWidth}
      enable={{
        top: false,
        right: vis && !right,
        bottom: false,
        left: vis && right,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      className={`single-cell-container ${APP_PANE_Z_INDEX_CLASS_NAME} col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0 border-setta-200 bg-setta-50 shadow-md transition-transform dark:border-setta-800 dark:bg-setta-900 ${paddingClasses} ${rightCondition} overflow-x-hidden overflow-y-hidden`}
      style={{ transform: `translateX(${vis ? "0" : style})` }}
    >
      {vis ? (
        <button
          type="button"
          className={`absolute z-20 inline-flex h-6 w-6 items-center justify-center rounded border border-setta-200 bg-setta-100 text-setta-500 transition-colors hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-800 dark:text-setta-300 dark:hover:border-blue-500 dark:hover:text-blue-400 ${fullscreenButtonPositionClass}`}
          aria-label="Full screen pane"
          title="Full width"
          data-testid={`${paneName}-pane-fullscreen-button`}
          onClick={onExpandToFullWidth}
        >
          <RiExpandDiagonalLine size={13} />
        </button>
      ) : null}
      {children}
    </Resizable>
  );
}
