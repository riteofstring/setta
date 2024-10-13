import { arrayMove } from "forks/dnd-kit/CustomSortable";
import _ from "lodash";

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

export function checkboxChangeFn(checked, id) {
  return (x) => {
    if (x) {
      return checked ? [...x, id] : x.filter((y) => y !== id);
    }
    return [id];
  };
}

export function radioChangeFn(checked, id) {
  return () => (checked ? id : null);
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

export async function getImageDimensionsFromBase64(base64String) {
  const img = new Image();
  img.src = base64String;
  await img.decode();
  return { width: img.width, height: img.height };
}
