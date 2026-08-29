export type WorkspaceSnapshot<Value> = Value extends (
  ...args: Array<never>
) => unknown
  ? Value
  : Value extends ReadonlyArray<infer Entry>
    ? ReadonlyArray<WorkspaceSnapshot<Entry>>
    : Value extends object
      ? { readonly [Key in keyof Value]: WorkspaceSnapshot<Value[Key]> }
      : Value;

function freezeWorkspaceSnapshot<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freezeWorkspaceSnapshot(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export function cloneFrozenWorkspaceSnapshot<T>(
  value: T,
): WorkspaceSnapshot<T> {
  return freezeWorkspaceSnapshot(
    structuredClone(value),
  ) as WorkspaceSnapshot<T>;
}
