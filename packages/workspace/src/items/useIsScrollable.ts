import { useEffect, useRef, useState } from "react";

// The reference's `useIsScrollable` (state/hooks/sectionSizes.ts) without its `onMeasure`
// option, which only feeds the reference's persisted param-area height measurements — an
// application-side feature.
export function useIsScrollable() {
  const [isScrollableVertical, setIsScrollableVertical] = useState(false);
  const [isScrollableHorizontal, setIsScrollableHorizontal] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    function checkScrollable() {
      if (elementRef.current) {
        setIsScrollableVertical(elementRef.current.scrollHeight > elementRef.current.clientHeight);
        setIsScrollableHorizontal(elementRef.current.scrollWidth > elementRef.current.clientWidth);
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      checkScrollable();
    });
    const mutationObserver = new MutationObserver(() => {
      checkScrollable();
    });

    resizeObserver.observe(elementRef.current);
    mutationObserver.observe(elementRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    checkScrollable();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return {
    ref: elementRef,
    isScrollable: isScrollableVertical || isScrollableHorizontal,
  };
}
