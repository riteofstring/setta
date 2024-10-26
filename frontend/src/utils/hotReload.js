import { useState, useEffect } from 'react';

// Isolate HMR detection to avoid router interference
const hmrHandler = {
  listeners: new Set(),
  initialized: false,

  setup() {
    if (import.meta.hot && !this.initialized) {
      import.meta.hot.on("vite:beforeUpdate", () => {
        this.listeners.forEach((listener) => listener(true));
      });
      this.initialized = true;
    }
  },

  subscribe(listener) {
    this.setup();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};

// Creates a no-op hook for production
const createNoopHook = () => () => false;

// Creates the actual development hook
const createDevHook = () => {
  return () => {
    const [isHotReload, setIsHotReload] = useState(false);

    useEffect(() => {
      // Only set up listener once per component instance
      const unsubscribe = hmrHandler.subscribe((isHot) => {
        setIsHotReload(isHot);
        // // Reset after a frame to avoid state updates during navigation
        // requestAnimationFrame(() => {
        //   setIsHotReload(false);
        // });
      });

      return unsubscribe;
    }, []);

    return isHotReload;
  };
};

// Use build-time environment check to determine which hook to use
export const useHotReload = import.meta.env.DEV
  ? createDevHook()
  : createNoopHook();
