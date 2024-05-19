import React from "react";
import { CLOSED_PANE_WIDTH } from "utils/constants";

export const localStorageFns = {
  darkMode: { init: true },
  showMinimap: { init: true },
  overviewVis: { init: true },
  overviewWidth: { init: 335 },
  overviewTrueWidth: { init: 335 },
  uiEditorVis: { init: false },
  uiEditorWidth: { init: 500 },
  uiEditorTrueWidth: { init: CLOSED_PANE_WIDTH },
};

for (const [k, v] of Object.entries(localStorageFns)) {
  localStorageFns[k].hook = () => useLocalStorage(k, v.init);
  localStorageFns[k].state = () => localStorageState(k);
}

function localStorageState(key) {
  const x = JSON.parse(getLocalStorageItem(key));
  const setX = (value) => {
    setLocalStorageItem(key, value);
  };
  return [x, setX];
}

function dispatchStorageEvent(key, newValue) {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
}

const setLocalStorageItem = (key, value) => {
  const stringifiedValue = JSON.stringify(value);
  window.localStorage.setItem(key, stringifiedValue);
  dispatchStorageEvent(key, stringifiedValue);
};

const removeLocalStorageItem = (key) => {
  window.localStorage.removeItem(key);
  dispatchStorageEvent(key, null);
};

const getLocalStorageItem = (key) => {
  return window.localStorage.getItem(key);
};

const useLocalStorageSubscribe = (callback) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getLocalStorageServerSnapshot = () => {
  throw Error("useLocalStorage is a client-only hook");
};

function useLocalStorage(key, initialValue) {
  const getSnapshot = () => getLocalStorageItem(key);

  const store = React.useSyncExternalStore(
    useLocalStorageSubscribe,
    getSnapshot,
    getLocalStorageServerSnapshot,
  );

  const setState = React.useCallback(
    (v) => {
      try {
        const nextState = typeof v === "function" ? v(JSON.parse(store)) : v;

        if (nextState === undefined || nextState === null) {
          removeLocalStorageItem(key);
        } else {
          setLocalStorageItem(key, nextState);
        }
      } catch (e) {
        console.warn(e);
      }
    },
    [key, store],
  );

  React.useEffect(() => {
    if (
      getLocalStorageItem(key) === null &&
      typeof initialValue !== "undefined"
    ) {
      setLocalStorageItem(key, initialValue);
    }
  }, [key, initialValue]);

  return [store ? JSON.parse(store) : initialValue, setState];
}
