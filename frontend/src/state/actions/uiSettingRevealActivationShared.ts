export function areStringArraysEqual(
  left: Array<string>,
  right: Array<string>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function resolveProjectConfigIdForActivation(
  fallbackProjectConfigId: string,
): string {
  const normalizedProjectConfigId = fallbackProjectConfigId.trim();
  if (normalizedProjectConfigId === "") {
    throw new Error("UI setting reveal content is missing projectConfigId.");
  }
  return normalizedProjectConfigId;
}
