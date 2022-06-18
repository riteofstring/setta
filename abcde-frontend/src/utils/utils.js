import { arrayMove } from "@dnd-kit/sortable";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";

export const createNewId = () => {
  return uuidv4();
};

export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

export function allDefined(...x) {
  return x.every((a) => !_.isNil(a));
}

// https://stackoverflow.com/a/38181008
// create new array with inserted value (no mutation)
function insertIntoArray(arr, index, ...newItems) {
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

export function rangeArray(low, high) {
  return Array.from(new Array(high), (x, i) => i + low);
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function curryAction(action, args, key = null) {
  const fn = (newState) => {
    const asArg = key ? { [key]: newState } : newState;
    return action({ ...args, ...asArg });
  };
  return fn;
}

export function defaultState(state, valueFn) {
  return state === undefined ? valueFn() : state;
}

export function updateWithArrayMove(active, over) {
  return (x) => {
    const activeIndex = x.indexOf(active.id);
    const overIndex = x.indexOf(over.id);
    return arrayMove(x, activeIndex, overIndex);
  };
}

// https://stackoverflow.com/a/21822316/16941290
export function findSortedIndex(array, value) {
  var low = 0,
    high = array.length;

  while (low < high) {
    var mid = (low + high) >>> 1;
    if (array[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function checkboxChangeFn(e, id) {
  return (x) => {
    if (x) {
      return e.target.checked ? [...x, id] : x.filter((y) => y !== id);
    }
    return [id];
  };
}

export function maybeNewId(x) {
  return x ? x : createNewId();
}
