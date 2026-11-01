function sameValue(left: unknown, right: unknown): boolean {
  return left === right || (left !== left && right !== right);
}

function entriesEqual(
  left: Map<unknown, unknown>,
  right: Map<unknown, unknown>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (!right.has(key) || !deepEqual(value, right.get(key))) {
      return false;
    }
  }
  return true;
}

function propertiesEqual(left: object, right: object): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      deepEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  );
}

function sameShape(left: unknown, right: unknown): left is object {
  return (
    typeof left === "object" &&
    typeof right === "object" &&
    left !== null &&
    right !== null &&
    Object.getPrototypeOf(left) === Object.getPrototypeOf(right)
  );
}

function objectsEqual(left: object, right: object): boolean {
  if (Array.isArray(left)) {
    const other = right as unknown[];
    return (
      left.length === other.length &&
      left.every((value, index) => deepEqual(value, other[index]))
    );
  }
  if (left instanceof Map) {
    return entriesEqual(left, right as Map<unknown, unknown>);
  }
  if (left instanceof Set) {
    const other = right as Set<unknown>;
    return left.size === other.size && [...left].every((v) => other.has(v));
  }
  if (left instanceof Date) {
    return left.getTime() === (right as Date).getTime();
  }
  return propertiesEqual(left, right);
}

export function deepEqual(left: unknown, right: unknown): boolean {
  return (
    sameValue(left, right) ||
    (sameShape(left, right) && objectsEqual(left, right as object))
  );
}
