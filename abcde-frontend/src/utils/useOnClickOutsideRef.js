// FROM: https://gist.github.com/NikaBuligini/66a2ec0a5d51a594b95f3603c0097c34

import React from "react";

export function useEventListener(eventName, handler, element = document) {
  const savedCallback = React.useRef();

  React.useEffect(() => {
    savedCallback.current = handler;
  }, [handler]);

  React.useEffect(() => {
    // Make sure element supports addEventListener
    const isSupported = element && element.addEventListener;
    if (!isSupported) {
      return;
    }

    const eventListener = (event) => savedCallback.current(event);

    element.addEventListener(eventName, eventListener);

    return () => {
      element.removeEventListener(eventName, eventListener);
    };
  }, [eventName, element]);
}

export default function useClickOutside(callback) {
  const ref = React.useRef(null);

  const mousedown = (event) => {
    if (ref.current && !ref.current.contains(event.target)) {
      callback(event);
    }
  };

  useEventListener("mousedown", mousedown);

  return ref;
}
