import { useEffect, useRef, useState } from "react";

// Frozen main's shared scrollability observer. Item lists and bounded groups keep the same DOM
// element mounted while content changes, so scroll ownership can react without remounting or
// losing the live scroll position.
export function useIsScrollable() {
  const [isScrollableVertical, setIsScrollableVertical] = useState(false);
  const [isScrollableHorizontal, setIsScrollableHorizontal] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    function checkScrollable() {
      if (elementRef.current) {
        setIsScrollableVertical(
          elementRef.current.scrollHeight > elementRef.current.clientHeight,
        );
        setIsScrollableHorizontal(
          elementRef.current.scrollWidth > elementRef.current.clientWidth,
        );
      }
    }

    const resizeObserver = new ResizeObserver(checkScrollable);
    const mutationObserver = new MutationObserver(checkScrollable);

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
