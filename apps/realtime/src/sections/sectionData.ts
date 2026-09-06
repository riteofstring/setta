import type { WorkspaceSectionData } from "@setta/workspace";

export type InputSectionData = {
  inputKind: "text" | "number" | "boolean";
  label: string;
  value: WorkspaceSectionData;
};

export type ButtonSectionData = {
  label: string;
};

export type OutputSectionData = {
  value: WorkspaceSectionData;
};

export type StatusSectionData = {
  level: "idle" | "info" | "success" | "error";
  message: string;
};

export type DrawingSectionData = {
  background: string;
  height: number;
  scene: WorkspaceSectionData;
  width: number;
};

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
