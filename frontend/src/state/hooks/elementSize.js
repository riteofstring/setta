import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    winWidth: undefined,
    winHeight: undefined,
  });

  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      setWindowSize({
        winWidth: window.innerWidth,
        winHeight: window.innerHeight,
      });
    }

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures that effect is only run on mount

  return windowSize;
}

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
      }, delay),
    ),
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
