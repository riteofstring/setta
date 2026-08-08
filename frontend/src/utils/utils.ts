export const isMacOs = () =>
  typeof navigator !== "undefined" && navigator?.userAgent?.indexOf("Mac") >= 0;

export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

export function updateArrayAt<T>(array: T[], index: number, newValue: T): T[] {
  const newArray = [...array];
  newArray[index] = newValue;
  return newArray;
}

// https://stackoverflow.com/a/38181008
// create new array with inserted value (no mutation)
export function insertIntoArray<T>(
  arr: Array<T>,
  index: number,
  ...newItems: Array<T>
) {
  return [
    // part of the array before the specified index
    ...arr.slice(0, index),
    // inserted items
    ...newItems,
    // part of the array after the specified index
    ...arr.slice(index),
  ];
}

export function tryParseJSON(x) {
  try {
    return JSON.parse(x);
  } catch {
    return x;
  }
}

export function shortcutPrettified(shortcut: string) {
  // macOS command symbol (⌘)
  const macSymbol = "⌘";
  const windowsText = "Ctrl";

  // Create a case-insensitive regular expression to match "mod"
  const modRegex = /mod/gi;

  // Replace all occurrences of "mod" (case-insensitive) with the appropriate symbol
  return shortcut.replace(modRegex, isMacOs() ? macSymbol : windowsText);
}

export function shortcutCodemirrorFormat(shortcut: string) {
  // Remove all spaces and split by '+'
  const parts = shortcut.replace(/\s+/g, "").split("+");

  // Convert single-character parts to lowercase, leave others unchanged
  const convertedParts = parts.map((part) =>
    part.length === 1 ? part.toLowerCase() : part,
  );

  // Join back with '-'
  return convertedParts.join("-");
}

export function positiveMod(n: number, m: number) {
  return ((n % m) + m) % m;
}
