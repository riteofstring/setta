import C from "constants/constants.json";
import { arrayMove } from "forks/dnd-kit/CustomSortable";
import _ from "lodash";

export const isMacOs = () =>
  typeof navigator !== "undefined" && navigator?.userAgent?.indexOf("Mac") >= 0;

export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

// https://stackoverflow.com/a/38181008
// create new array with inserted value (no mutation)
export function insertIntoArray(arr, index, ...newItems) {
  return [
    // part of the array before the specified index
    ...arr.slice(0, index),
    // inserted items
    ...newItems,
    // part of the array after the specified index
    ...arr.slice(index),
  ];
}

export function updateWithArrayMove(active, over) {
  return (x) => {
    const activeIndex = x.indexOf(active.id);
    const overIndex = x.indexOf(over.id);
    return arrayMove(x, activeIndex, overIndex);
  };
}

export function bothTruthyOrFalsey(a, b) {
  return !a === !b || a === b;
}

export function asyncDebounce(func, wait) {
  const debounced = _.debounce((resolve, reject, args) => {
    func(...args)
      .then(resolve)
      .catch(reject);
  }, wait);
  return (...args) =>
    new Promise((resolve, reject) => {
      debounced(resolve, reject, args);
    });
}

export function isFromJSONSource(id) {
  return id.startsWith(C.JSON_SOURCE_PREFIX);
}

export function tryParseJSON(x) {
  try {
    return JSON.parse(x);
  } catch {
    return x;
  }
}

export function shortcutPrettified(shortcut) {
  // macOS command symbol (⌘)
  const macSymbol = "⌘";
  const windowsText = "Ctrl";

  // Create a case-insensitive regular expression to match "mod"
  const modRegex = /mod/gi;

  // Replace all occurrences of "mod" (case-insensitive) with the appropriate symbol
  return shortcut.replace(modRegex, isMacOs() ? macSymbol : windowsText);
}

export function dummyRegExpObject() {
  return {
    exec: function () {
      return null;
    },
  };
}
