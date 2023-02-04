import { useLayoutEffect, useRef } from "react";

// https://stackoverflow.com/questions/69469814/how-can-i-throttle-a-resizeobserver
function throttle(f, delay) {
  let timer = 0;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => f.apply(this, args), delay);
  };
}

// https://blog.sethcorker.com/resize-observer-api/
export function useSizeOfResizableElement({ delay, dimName, callback }) {
  const sizeRef = useRef(null);
  const size = useSizeOfResizableRef({
    current: sizeRef.current,
    delay,
    dimName,
    callback,
  });
  return { sizeRef, size };
}

export function useSizeOfResizableRef({ current, delay, dimName, callback }) {
  const size = useRef(dimName === "both" ? { width: 0, height: 0 } : 0);

  const observer = useRef(
    new ResizeObserver(
      throttle((entries) => {
        // Only care about the first element, we expect one element ot be watched
        const rect = entries[0].contentRect;
        const newSize =
          dimName === "both"
            ? { width: rect.width, height: rect.height }
            : rect[dimName];
        if (callback) {
          callback({ prev: size.current, curr: newSize });
        }
        size.current = newSize;
      }, delay)
    )
  );

  useLayoutEffect(() => {
    if (current) {
      observer.current.observe(current);
    }

    return () => {
      if (current) {
        observer.current.unobserve(current);
      }
    };
  }, [current, observer]);

  return size.current;
}
