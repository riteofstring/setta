import type { WorkspaceSectionData } from "../document/types";

export const WORKSPACE_TEXT_SECTION_KIND = "setta.text";

export type WorkspaceTextSectionFormat = "plaintext" | "markdown";
export const WORKSPACE_TEXT_SECTION_FORMATS: ReadonlyArray<WorkspaceTextSectionFormat> =
  ["plaintext", "markdown"];

export type WorkspaceTextSectionDisplayMode = "render" | "edit";
export const WORKSPACE_TEXT_SECTION_DISPLAY_MODES: ReadonlyArray<WorkspaceTextSectionDisplayMode> =
  ["render", "edit"];

export const WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE = 8;
export const WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE = 48;
export const WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE = 14;

export type WorkspaceTextSectionData = {
  text: string;
  format: WorkspaceTextSectionFormat;
  displayMode: WorkspaceTextSectionDisplayMode;

  fontSizePx: number;
  readOnly: boolean;
};

const WORKSPACE_TEXT_SECTION_FIELDS: ReadonlyArray<
  keyof WorkspaceTextSectionData
> = ["text", "format", "displayMode", "fontSizePx", "readOnly"];

export function createWorkspaceTextSectionData(
  overrides: Partial<WorkspaceTextSectionData> = {},
): WorkspaceTextSectionData {
  return {
    text: "",
    format: "plaintext",
    displayMode: "edit",
    fontSizePx: WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE,
    readOnly: false,
    ...overrides,
  };
}

function getDataRecord(
  sectionId: string,
  data: WorkspaceSectionData | undefined,
): { [key: string]: WorkspaceSectionData } {
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      `Text section ${sectionId} is missing its text section data.`,
    );
  }
  for (const key of Object.keys(data)) {
    if (
      !(WORKSPACE_TEXT_SECTION_FIELDS as ReadonlyArray<string>).includes(key)
    ) {
      throw new Error(
        `Text section ${sectionId} carries the unknown field ${key}.`,
      );
    }
  }
  return data;
}

function getString(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(
      `Text section ${sectionId} is missing its string ${field} field.`,
    );
  }
  return value;
}

function getBoolean(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  field: string,
): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(
      `Text section ${sectionId} is missing its boolean ${field} field.`,
    );
  }
  return value;
}

function getFontSizePx(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
): number {
  const value = record["fontSizePx"];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE ||
    value > WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE
  ) {
    throw new Error(
      `Text section ${sectionId} needs a fontSizePx between ` +
        `${String(WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE)} and ` +
        `${String(WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE)}.`,
    );
  }
  return value;
}

function getFormat(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  allowedFormats: ReadonlyArray<WorkspaceTextSectionFormat>,
): WorkspaceTextSectionFormat {
  const value = getString(sectionId, record, "format");
  if (!allowedFormats.includes(value as WorkspaceTextSectionFormat)) {
    throw new Error(
      `Text section ${sectionId} names the format ${value}, which this registration does not ` +
        `allow. Allowed formats: ${allowedFormats.join(", ")}.`,
    );
  }
  return value as WorkspaceTextSectionFormat;
}

function getDisplayMode(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  allowedDisplayModes: ReadonlyArray<WorkspaceTextSectionDisplayMode>,
): WorkspaceTextSectionDisplayMode {
  const value = getString(sectionId, record, "displayMode");
  if (!allowedDisplayModes.includes(value as WorkspaceTextSectionDisplayMode)) {
    throw new Error(
      `Text section ${sectionId} names the display mode ${value}, which this registration does ` +
        `not allow. Allowed display modes: ${allowedDisplayModes.join(", ")}.`,
    );
  }
  return value as WorkspaceTextSectionDisplayMode;
}

export type WorkspaceTextSectionChoices = {
  formats: ReadonlyArray<WorkspaceTextSectionFormat>;
  displayModes: ReadonlyArray<WorkspaceTextSectionDisplayMode>;
};

const DEFAULT_CHOICES: WorkspaceTextSectionChoices = {
  formats: WORKSPACE_TEXT_SECTION_FORMATS,
  displayModes: WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
};

export function parseWorkspaceTextSectionData(
  sectionId: string,
  data: WorkspaceSectionData | undefined,
  choices: WorkspaceTextSectionChoices = DEFAULT_CHOICES,
): WorkspaceTextSectionData {
  const record = getDataRecord(sectionId, data);
  return {
    text: getString(sectionId, record, "text"),
    format: getFormat(sectionId, record, choices.formats),
    displayMode: getDisplayMode(sectionId, record, choices.displayModes),
    fontSizePx: getFontSizePx(sectionId, record),
    readOnly: getBoolean(sectionId, record, "readOnly"),
  };
}

export function getWorkspaceTextSectionEditorLanguage(
  format: WorkspaceTextSectionFormat,
): "markdown" | null {
  return format === "markdown" ? "markdown" : null;
}
