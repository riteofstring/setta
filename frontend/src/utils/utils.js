import { arrayMove } from "forks/dnd-kit/CustomSortable";

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

export function xnor(a, b) {
  return a == b;
}

export function maybePreventDefault(e) {
  if (e) {
    e.preventDefault();
  }
}
