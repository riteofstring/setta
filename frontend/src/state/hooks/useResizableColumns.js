import { useCallback, useEffect, useRef } from "react";
import { useSectionColumnWidth } from "state/definitions";

export function useResizableColumn(sectionId, options = {}) {
  // Default options
  const {
    minWidth = 100,
    maxWidth = 500,
    defaultWidth = 200,
    persistOnUnmount = true,
  } = options;

  // Refs for header and content elements
  const headerRef = useRef();
  const contentRef = useRef();

  useEffect(() => {
    // Initialize the store with default width if not already set
    if (useSectionColumnWidth.getState()[sectionId] === undefined) {
      useSectionColumnWidth.setState((state) => ({
        ...state,
        [sectionId]: defaultWidth,
      }));
    }

    // Subscribe to store changes
    return useSectionColumnWidth.subscribe(
      (state) => state[sectionId],
      (columnWidth) => {
        applyColumnWidth(columnWidth);
      },
      { fireImmediately: true },
    );
  }, [sectionId, defaultWidth]);

  // Clean up the store entry if needed
  useEffect(() => {
    return () => {
      if (!persistOnUnmount) {
        useSectionColumnWidth.setState((state) => {
          const newState = { ...state };
          delete newState[sectionId];
          return newState;
        });
      }
    };
  }, [sectionId, persistOnUnmount]);

  // Apply column width to elements
  const applyColumnWidth = useCallback((width) => {
    // Apply to header if ref exists
    if (headerRef.current) {
      headerRef.current.style.gridTemplateColumns = `minmax(min-content, ${width}px) 1fr`;
    }

    // Apply to all child rows if content ref exists
    if (contentRef.current) {
      const rows = contentRef.current.querySelectorAll("[data-resizable-row]");
      rows.forEach((row) => {
        row.style.gridTemplateColumns = `minmax(min-content, ${width}px) 1fr`;
      });
    }
  }, []);

  // Handle resize
  const handleResize = useCallback(
    (e) => {
      e.preventDefault();

      const startX = e.clientX;
      const startWidth =
        useSectionColumnWidth.getState()[sectionId] || defaultWidth;

      function onMouseMove(e) {
        const delta = e.clientX - startX;
        const newWidth = Math.max(
          minWidth,
          Math.min(maxWidth, startWidth + delta),
        );

        // Update the store with new width
        useSectionColumnWidth.setState((state) => ({
          ...state,
          [sectionId]: newWidth,
        }));
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sectionId, minWidth, maxWidth, defaultWidth],
  );

  return {
    headerRef,
    contentRef,
    handleResize,

    // Helper for marking rows as resizable
    getRowProps: () => ({
      "data-resizable-row": true,
    }),

    // Get the current width (useful for controlled components)
    getCurrentWidth: () =>
      useSectionColumnWidth.getState()[sectionId] || defaultWidth,

    // Manually set the width (useful for control outside resize handle)
    setColumnWidth: (width) => {
      const newWidth = Math.max(minWidth, Math.min(maxWidth, width));
      useSectionColumnWidth.setState((state) => ({
        ...state,
        [sectionId]: newWidth,
      }));
    },
  };
}
