export function toProjectGpuParamDisplayValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
