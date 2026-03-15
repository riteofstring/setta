import { useEffect, useRef, useState } from "react";

type UseIsScrollableOptions = {
  onMeasure?: (element: HTMLDivElement) => void;
};

export function useIsScrollable(options: UseIsScrollableOptions = {}) {
  const [isScrollableVertical, setIsScrollableVertical] = useState(false);
  const [isScrollableHorizontal, setIsScrollableHorizontal] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const onMeasureRef = useRef<UseIsScrollableOptions["onMeasure"]>(null);

  useEffect(() => {
    onMeasureRef.current = options.onMeasure ?? null;
  }, [options.onMeasure]);

  useEffect(() => {
    if (!elementRef.current) {
      return;
    }

    function checkScrollable() {
      if (elementRef.current) {
        setIsScrollableVertical(
          elementRef.current.scrollHeight > elementRef.current.clientHeight,
        );
        setIsScrollableHorizontal(
          elementRef.current.scrollWidth > elementRef.current.clientWidth,
        );
        onMeasureRef.current?.(elementRef.current);
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
