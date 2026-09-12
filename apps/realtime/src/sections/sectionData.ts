import type { WorkspaceSectionData } from "@setta/workspace";

type InputSectionData = {
  inputKind: "text" | "number" | "boolean";
  label: string;
  value: WorkspaceSectionData;
};

type ButtonSectionData = {
  label: string;
};

type OutputSectionData = {
  value: WorkspaceSectionData;
};

type StatusSectionData = {
  level: "idle" | "info" | "success" | "error";
  message: string;
};

type DrawingSectionData = {
  background: string;
  height: number;
  scene: WorkspaceSectionData;
  width: number;
};

type HandlerSectionData = {
  bindingId: string;
};

function handlerData(value: unknown): HandlerSectionData | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1
  ) {
    return null;
  }
  const bindingId = (value as { bindingId?: unknown }).bindingId;
  return typeof bindingId === "string" && bindingId.length > 0
    ? { bindingId }
    : null;
}

export function assertHandlerSectionData(
  data: unknown,
): asserts data is HandlerSectionData {
  if (handlerData(data) === null) {
    throw new Error(
      "Realtime handler section data must contain exactly one non-empty bindingId.",
    );
  }
}

export function readHandlerSectionData(data: unknown): HandlerSectionData {
  assertHandlerSectionData(data);
  return data;
}

export function readInputSectionData(
  data: WorkspaceSectionData | undefined,
): InputSectionData {
  return data as InputSectionData;
}

export function readButtonSectionData(
  data: WorkspaceSectionData | undefined,
): ButtonSectionData {
  return data as ButtonSectionData;
}

export function readOutputSectionData(
  data: WorkspaceSectionData | undefined,
): OutputSectionData {
  return data as OutputSectionData;
}

export function readStatusSectionData(
  data: WorkspaceSectionData | undefined,
): StatusSectionData {
  return data as StatusSectionData;
}

export function readDrawingSectionData(
  data: WorkspaceSectionData | undefined,
): DrawingSectionData {
  return data as DrawingSectionData;
}
