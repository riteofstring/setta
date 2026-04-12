import type { MouseEventHandler } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useListRef } from "react-window";
import { getDefaultColumnWidth } from "state/hooks/columnWidthUtils";
import { useColumnWidthDrag } from "state/hooks/useColumnWidthDrag";
import { clamp } from "utils/utils";
import {
  FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
  FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
  FILE_COLUMN_CSS_VAR,
  HEADER_HEIGHT,
} from "./fileBrowserPaneShared";

type UseFileBrowserPaneLayoutArgs = {
  columnWidthConfig:
    | {
        columnWidth: string;
        onResizeStart: MouseEventHandler<HTMLDivElement>;
      }
    | undefined;
};

export function useFileBrowserPaneLayout({
  columnWidthConfig,
}: UseFileBrowserPaneLayoutArgs) {
  const [isTooltipKeyHeld, setIsTooltipKeyHeld] = useState(false);
  const [listSize, setListSize] = useState({ height: 320, width: 320 });
  const listRef = useListRef();
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const pathInputId = useId();
  const columnResizeDepthRef = useRef(1);
  const {
    handleResizeStart: handleLocalResizeStart,
    setNewWidth,
    widthRef,
  } = useColumnWidthDrag({
    outerRef: listWrapperRef,
    maxNestedDepthRef: columnResizeDepthRef,
    applyWidth: (width) => {
      if (listWrapperRef.current) {
        listWrapperRef.current.style.setProperty(
          FILE_COLUMN_CSS_VAR,
          `${width}px`,
        );
      }
    },
    persistWidth: () => {},
    getBoundedWidth: (width, containerWidth) =>
      clamp(
        width,
        FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
        Math.max(
          FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          containerWidth - FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
        ),
      ),
  });

  useEffect(() => {
    const wrapper = listWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setListSize({
          height: entry.contentRect.height,
          width: entry.contentRect.width,
        });
      }
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const updateTooltipKey = (event: KeyboardEvent, held: boolean) => {
      if (event.code === "KeyQ") {
        setIsTooltipKeyHeld(held);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      updateTooltipKey(event, true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      updateTooltipKey(event, false);
    };
    const handleWindowBlur = () => {
      setIsTooltipKeyHeld(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (columnWidthConfig || !listWrapperRef.current) {
      return;
    }
    const containerWidth = listWrapperRef.current.clientWidth;
    if (!containerWidth || widthRef.current.currentWidth !== 0) {
      return;
    }
    setNewWidth(containerWidth, getDefaultColumnWidth(containerWidth));
  }, [columnWidthConfig, listSize.width, setNewWidth, widthRef]);

  const columnWidth = columnWidthConfig?.columnWidth
    ? columnWidthConfig.columnWidth
    : `var(${FILE_COLUMN_CSS_VAR}, 55%)`;
  const handleResizeStart =
    columnWidthConfig?.onResizeStart ?? handleLocalResizeStart;

  return {
    isTooltipKeyHeld,
    listRef,
    listWrapperRef,
    pathInputId,
    listHeight: Math.max(1, listSize.height - HEADER_HEIGHT),
    listWidth: Math.max(1, listSize.width),
    columnWidth,
    handleResizeStart,
    gridTemplateColumns: `minmax(${FILE_BROWSER_FILE_COLUMN_MIN_WIDTH}px, min(${columnWidth}, calc(100% - ${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px))) minmax(${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px, 1fr)`,
  };
}
