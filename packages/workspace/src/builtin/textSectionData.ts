import type { WorkspaceSectionData } from "../document/types";

// The built-in Text section's document contract. Unlike a host kind's opaque `data`, the package
// owns this shape, so it is parsed once at the load boundary and read back as a validated internal
// type. The reference carries the same state in its generated `TextBlockSection` impl (`text`,
// `format`, `textDisplayMode`, `masterFontSizePx`); its docstring conversion, heading-as-name
// option, meta-control look, variants, and freeze flag are application concepts and stay out of
// the package.

// The stable kind ID hosts register this section under. It is package-reserved: a document
// naming it is a built-in text section, whatever else the host registers beside it.
export const WORKSPACE_TEXT_SECTION_KIND = "setta.text";

// The reference's `TextBlockFormatEnum`, in its declared order.
export type WorkspaceTextSectionFormat = "plaintext" | "markdown";
export const WORKSPACE_TEXT_SECTION_FORMATS: ReadonlyArray<WorkspaceTextSectionFormat> = [
  "plaintext",
  "markdown",
];

// The reference's `TextBlockDisplayModeEnum`, in its declared order.
export type WorkspaceTextSectionDisplayMode = "render" | "edit";
export const WORKSPACE_TEXT_SECTION_DISPLAY_MODES: ReadonlyArray<WorkspaceTextSectionDisplayMode> =
  ["render", "edit"];

// The reference's `clampTextBlockMasterFontSize` bounds. The reference clamps a stray value
// silently; the package rejects it at the boundary instead, because a document that authored an
// unusable size should fail where it entered rather than paint something it did not ask for.
export const WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE = 8;
export const WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE = 48;
export const WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE = 14;

export type WorkspaceTextSectionData = {
  text: string;
  format: WorkspaceTextSectionFormat;
  displayMode: WorkspaceTextSectionDisplayMode;
  // The reference's `masterFontSizePx`: the base of the rendered typography scale. It sizes the
  // rendered surface only; the reference's in-section editor keeps its own editor metrics.
  fontSizePx: number;
  readOnly: boolean;
};

const WORKSPACE_TEXT_SECTION_FIELDS: ReadonlyArray<keyof WorkspaceTextSectionData> = [
  "text",
  "format",
  "displayMode",
  "fontSizePx",
  "readOnly",
];

// The reference's text block opens empty and plain, at its 14 px base. Its generated default
// display mode is Render, but `ensureTextBlockDisplayMode` overrides every creation request to
// Edit, so a newly created section opens in its editor.
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
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Text section ${sectionId} is missing its text section data.`);
  }
  for (const key of Object.keys(data)) {
    if (!(WORKSPACE_TEXT_SECTION_FIELDS as ReadonlyArray<string>).includes(key)) {
      throw new Error(`Text section ${sectionId} carries the unknown field ${key}.`);
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
    throw new Error(`Text section ${sectionId} is missing its string ${field} field.`);
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
    throw new Error(`Text section ${sectionId} is missing its boolean ${field} field.`);
  }
  return value;
}

function getFontSizePx(sectionId: string, record: { [key: string]: WorkspaceSectionData }): number {
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

// What a registration that narrows nothing accepts: every format and both display modes.
const DEFAULT_CHOICES: WorkspaceTextSectionChoices = {
  formats: WORKSPACE_TEXT_SECTION_FORMATS,
  displayModes: WORKSPACE_TEXT_SECTION_DISPLAY_MODES,
};

// The one parser for this contract. `loadWorkspaceDocument` runs it at the boundary so a
// malformed document fails on load rather than on first paint, and the section body runs it
// again over the live section so a later host write fails the same explicit way.
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

// Markdown edits through the reference's Markdown language pack; plain text is the absence of a
// language pack, exactly as the reference's `MarkdownEditorCore` resolves its non-Markdown format
// to a null language.
export function getWorkspaceTextSectionEditorLanguage(
  format: WorkspaceTextSectionFormat,
): "markdown" | null {
  return format === "markdown" ? "markdown" : null;
}
