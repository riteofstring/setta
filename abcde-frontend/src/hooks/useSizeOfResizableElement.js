import React, { useLayoutEffect, useRef } from "react";

// https://stackoverflow.com/questions/69469814/how-can-i-throttle-a-resizeobserver
function throttle(f, delay) {
  let timer = 0;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => f.apply(this, args), delay);
  };
}

// https://blog.sethcorker.com/resize-observer-api/
export function useSizeOfResizableElement({ delay }) {
  const sizeRef = useRef();
  const size = useSizeOfResizableRef({ current: sizeRef.current, delay });
  return { sizeRef, size };
}

export function useSizeOfResizableRef({ current, delay }) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  const observer = React.useRef(
    new ResizeObserver(
      throttle((entries) => {
        // Only care about the first element, we expect one element ot be watched
        const { width, height } = entries[0].contentRect;
        setSize({ width, height });
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

  return size;
}
