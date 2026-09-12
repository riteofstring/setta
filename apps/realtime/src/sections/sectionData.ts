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
