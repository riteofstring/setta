import { useCallback, useEffect, useRef, type MouseEventHandler } from "react";

type ResizableColumnOptions = {
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
};

export function useResizableColumn(
  sectionId: string,
  options: ResizableColumnOptions = {},
) {
  const { minWidth = 100, maxWidth = 500, defaultWidth = 200 } = options;

  const headerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef<number>(defaultWidth);
  const rafRef = useRef<number | null>(null);

  const applyColumnWidth = useCallback((width: number) => {
    if (headerRef.current) {
      headerRef.current.style.gridTemplateColumns = `minmax(min-content, ${width}px) 1fr`;
    }

    if (contentRef.current) {
      const rows = contentRef.current.querySelectorAll("[data-resizable-row]");
      rows.forEach((row) => {
        row.style.gridTemplateColumns = `minmax(min-content, ${width}px) 1fr`;
      });
    }
  }, []);

  useEffect(() => {
    widthRef.current = defaultWidth;
    applyColumnWidth(defaultWidth);
  }, [applyColumnWidth, defaultWidth, sectionId]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleResize: MouseEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = widthRef.current;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(() => {
          const delta = moveEvent.clientX - startX;
          const nextWidth = Math.max(
            minWidth,
            Math.min(maxWidth, startWidth + delta),
          );
          widthRef.current = nextWidth;
          applyColumnWidth(nextWidth);
          rafRef.current = null;
        });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [applyColumnWidth, maxWidth, minWidth],
  );

  return {
    headerRef,
    contentRef,
    handleResize,
    getRowProps: () => ({
      "data-resizable-row": true,
    }),
    getCurrentWidth: () => widthRef.current,
    setColumnWidth: (width: number) => {
      const newWidth = Math.max(minWidth, Math.min(maxWidth, width));
      widthRef.current = newWidth;
      applyColumnWidth(newWidth);
    },
  };
}
