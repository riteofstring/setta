import type { WorkspaceEditorLanguage } from "../controls/text/textValueLanguages";
import type { WorkspaceSectionData } from "../document/types";

// The built-in Code Editor section's document contract. Unlike a host kind's opaque `data`, the
// package owns this shape, so it is parsed once at the load boundary and read back as a validated
// internal type. The reference's code section carries the same editor state in its generated
// `CodeSection` impl (`code`, `codeLanguage`); its file binding, freeze flag, LSP diagnostics, and
// generated-code regions are application concepts and stay out of the package.

// The stable kind ID hosts register this section under. It is package-reserved: a document
// naming it is a built-in code section, whatever else the host registers beside it.
export const WORKSPACE_CODE_SECTION_KIND = "setta.code";

export type WorkspaceCodeSectionLanguage = WorkspaceEditorLanguage | "plaintext";

// The reference's `CodeLanguageEnum`, in its declared order.
export const WORKSPACE_CODE_SECTION_LANGUAGES: ReadonlyArray<WorkspaceCodeSectionLanguage> = [
  "python",
  "bash",
  "javascript",
  "typescript",
  "json",
  "yaml",
  "toml",
  "markdown",
  "plaintext",
];

// Package-only design decision: the reference has no authored indentation width (it hard-codes
// `tabSize: 4` at every code editor), so the package bounds its own option instead of accepting an
// arbitrary integer that would render an unusable gutter.
export const WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH = 1;
export const WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH = 8;
export const WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH = 4;

export type WorkspaceCodeSectionData = {
  code: string;
  language: WorkspaceCodeSectionLanguage;
  wrapLines: boolean;
  lineNumbers: boolean;
  indentWidth: number;
  readOnly: boolean;
};

const WORKSPACE_CODE_SECTION_FIELDS: ReadonlyArray<keyof WorkspaceCodeSectionData> = [
  "code",
  "language",
  "wrapLines",
  "lineNumbers",
  "indentWidth",
  "readOnly",
];

// The reference's code area opens empty, at Python, wrapped off, with its gutters and its
// four-space indentation.
export function createWorkspaceCodeSectionData(
  overrides: Partial<WorkspaceCodeSectionData> = {},
): WorkspaceCodeSectionData {
  return {
    code: "",
    language: "python",
    wrapLines: false,
    lineNumbers: true,
    indentWidth: WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH,
    readOnly: false,
    ...overrides,
  };
}

function getDataRecord(
  sectionId: string,
  data: WorkspaceSectionData | undefined,
): { [key: string]: WorkspaceSectionData } {
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Code section ${sectionId} is missing its code section data.`);
  }
  for (const key of Object.keys(data)) {
    if (!(WORKSPACE_CODE_SECTION_FIELDS as ReadonlyArray<string>).includes(key)) {
      throw new Error(`Code section ${sectionId} carries the unknown field ${key}.`);
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
    throw new Error(`Code section ${sectionId} is missing its string ${field} field.`);
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
    throw new Error(`Code section ${sectionId} is missing its boolean ${field} field.`);
  }
  return value;
}

function getIndentWidth(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
): number {
  const value = record["indentWidth"];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH ||
    value > WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH
  ) {
    throw new Error(
      `Code section ${sectionId} needs an integer indentWidth between ` +
        `${String(WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH)} and ` +
        `${String(WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH)}.`,
    );
  }
  return value;
}

function getLanguage(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage>,
): WorkspaceCodeSectionLanguage {
  const value = getString(sectionId, record, "language");
  if (!allowedLanguages.includes(value as WorkspaceCodeSectionLanguage)) {
    throw new Error(
      `Code section ${sectionId} names the language ${value}, which this registration does not ` +
        `allow. Allowed languages: ${allowedLanguages.join(", ")}.`,
    );
  }
  return value as WorkspaceCodeSectionLanguage;
}

// The one parser for this contract. `loadWorkspaceDocument` runs it at the boundary so a
// malformed document fails on load rather than on first paint, and the section body runs it
// again over the live section so a later host write fails the same explicit way.
export function parseWorkspaceCodeSectionData(
  sectionId: string,
  data: WorkspaceSectionData | undefined,
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage> = WORKSPACE_CODE_SECTION_LANGUAGES,
): WorkspaceCodeSectionData {
  const record = getDataRecord(sectionId, data);
  return {
    code: getString(sectionId, record, "code"),
    language: getLanguage(sectionId, record, allowedLanguages),
    wrapLines: getBoolean(sectionId, record, "wrapLines"),
    lineNumbers: getBoolean(sectionId, record, "lineNumbers"),
    indentWidth: getIndentWidth(sectionId, record),
    readOnly: getBoolean(sectionId, record, "readOnly"),
  };
}

// Plain text is the absence of a language pack rather than a mode of its own, exactly as the
// reference's `getCodeMirrorLanguageSupport` resolves its `plaintext` enum member to no support.
export function getWorkspaceCodeSectionEditorLanguage(
  language: WorkspaceCodeSectionLanguage,
): WorkspaceEditorLanguage | null {
  return language === "plaintext" ? null : language;
}
