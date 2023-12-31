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
export function useSizeOfResizableElement({ delay, callback }) {
  const sizeRef = useRef();
  const size = useSizeOfResizableRef({
    sizeRef,
    delay,
    callback,
  });
  return { sizeRef, size };
}

function useSizeOfResizableRef({ sizeRef, delay, callback }) {
  const size = useRef({ width: 0, height: 0 });

  const observer = useRef(
    new ResizeObserver(
      throttle((entries) => {
        // Only care about the first element, we expect one element ot be watched
        const rect = entries[0].contentRect;
        const newSize = { width: rect.width, height: rect.height };
        if (callback) {
          callback({ prev: size.current, curr: newSize });
        }
        size.current = newSize;
      }, delay)
    )
  );

  useLayoutEffect(() => {
    if (sizeRef.current) {
      observer.current.observe(sizeRef.current);
    }

    return () => {
      if (sizeRef.current) {
        observer.current.unobserve(sizeRef.current);
      }
    };
  }, [sizeRef.current, observer]);

  return size.current;
}
