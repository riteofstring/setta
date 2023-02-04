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
export default function useSizeOfResizableElement({ delay }) {
  const sizeRef = useRef();
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
    if (sizeRef.current) {
      observer.current.observe(sizeRef.current);
    }

    return () => {
      if (sizeRef.current) {
        observer.current.unobserve(sizeRef.current);
      }
    };
  }, [sizeRef, observer]);

  return { sizeRef, size };
}
