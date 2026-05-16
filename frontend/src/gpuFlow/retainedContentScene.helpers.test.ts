import type { GpuRetainedContentRowInput } from "./retainedContentScene";

export function row(
  id: string,
  overrides: Partial<GpuRetainedContentRowInput> = {},
): GpuRetainedContentRowInput {
  const controlKind = overrides.controlKind ?? "text-like";
  return {
    ...(controlKind === "text-like"
      ? {
          control: {
            defaultDisplayValue: "",
            displayValue: id,
            editorKind: "text" as const,
            kind: "text-like" as const,
            rendererFamily: "text-like",
            commitPolicy: "native-island" as const,
          },
        }
      : {}),
    controlKind,
    depth: 0,
    id,
    label: id,
    ...overrides,
  };
}

export function calendarCells(selectedIsoDate: string) {
  return Array.from({ length: 42 }, (_, index) => {
    const day = index + 1;
    const isoDate = `2026-05-${String(day).padStart(2, "0")}`;
    return {
      dayOfMonth: day,
      inCurrentMonth: true,
      isoDate,
      selected: isoDate === selectedIsoDate,
      today: false,
    };
  });
}
