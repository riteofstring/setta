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
export default function useWidthOfResizableElement() {
  const widthRef = useRef();
  const [width, setWidth] = React.useState(0);

  const observer = React.useRef(
    new ResizeObserver(
      throttle((entries) => {
        // Only care about the first element, we expect one element ot be watched
        const { width } = entries[0].contentRect;
        setWidth(width);
      }, 200)
    )
  );

  useLayoutEffect(() => {
    if (widthRef.current) {
      observer.current.observe(widthRef.current);
    }

    return () => {
      observer.current.unobserve(widthRef.current);
    };
  }, [widthRef, observer]);

  return { widthRef, width };
}
