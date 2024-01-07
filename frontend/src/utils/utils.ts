import { arrayMove } from "@dnd-kit/sortable";

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

export function insertIntoArrayOrXpend(arr, index, prepend, ...newItems) {
  if (index === null) {
    if (prepend) {
      return [...newItems, ...arr];
    } else {
      return [...arr, ...newItems];
    }
  } else {
    return insertIntoArray(arr, index, ...newItems);
  }
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

export function areMapKeysEqual(map1, map2) {
  if (map1.size !== map2.size) {
    return false; // Different number of keys means they are not equal
  }

  for (const key of map1.keys()) {
    if (!map2.has(key)) {
      return false; // Key in map1 is not in map2
    }
  }

  return true; // All keys in map1 are in map2 and sizes are the same
}
