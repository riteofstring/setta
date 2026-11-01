import type { WorkspaceEditorLanguage } from "../controls/text/textValueLanguages";
import type { WorkspaceSectionData } from "../document/types";

export const WORKSPACE_CODE_SECTION_KIND = "setta.code";

export type WorkspaceCodeSectionLanguage =
  WorkspaceEditorLanguage | "plaintext";

export type WorkspaceCodeSectionMode =
  "editable" | "read-only" | "generated-document";

export const WORKSPACE_CODE_SECTION_MODES: ReadonlyArray<WorkspaceCodeSectionMode> =
  ["editable", "read-only", "generated-document"];

export type WorkspaceGeneratedRegion = Readonly<{
  from: number;
  to: number;
}>;

export type WorkspaceCodeSectionDiagnosticSeverity =
  "error" | "warning" | "info";

export type WorkspaceCodeSectionDiagnostic = Readonly<{
  from: number;
  to: number;
  severity: WorkspaceCodeSectionDiagnosticSeverity;
  message: string;
}>;

export const WORKSPACE_CODE_SECTION_LANGUAGES: ReadonlyArray<WorkspaceCodeSectionLanguage> =
  [
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

export const WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH = 1;
export const WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH = 8;
export const WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH = 4;

type WorkspaceCodeSectionCommonData = {
  code: string;
  diagnostics: Array<WorkspaceCodeSectionDiagnostic>;
  language: WorkspaceCodeSectionLanguage;
  wrapLines: boolean;
  lineNumbers: boolean;
  indentWidth: number;
};

export type WorkspaceCodeSectionData =
  | (WorkspaceCodeSectionCommonData & { mode: "editable" | "read-only" })
  | (WorkspaceCodeSectionCommonData & {
      generatedRegion: WorkspaceGeneratedRegion;
      mode: "generated-document";
    });

export type WorkspaceCodeSectionDataOverrides =
  | (Partial<WorkspaceCodeSectionCommonData> & {
      mode?: "editable" | "read-only";
    })
  | (Partial<WorkspaceCodeSectionCommonData> & {
      code: string;
      generatedRegion: WorkspaceGeneratedRegion;
      mode: "generated-document";
    });

const WORKSPACE_CODE_SECTION_COMMON_FIELDS: ReadonlyArray<string> = [
  "code",
  "diagnostics",
  "language",
  "wrapLines",
  "lineNumbers",
  "indentWidth",
  "mode",
];
const WORKSPACE_GENERATED_REGION_FIELD = "generatedRegion";
const WORKSPACE_GENERATED_REGION_FIELDS: ReadonlyArray<string> = ["from", "to"];
const WORKSPACE_CODE_SECTION_DIAGNOSTIC_FIELDS: ReadonlyArray<string> = [
  "from",
  "to",
  "severity",
  "message",
];

export function createWorkspaceCodeSectionData(
  overrides: WorkspaceCodeSectionDataOverrides = {},
): WorkspaceCodeSectionData {
  const common = createWorkspaceCodeSectionCommonData(overrides);
  if (overrides.mode === "generated-document") {
    return {
      ...common,
      generatedRegion: overrides.generatedRegion,
      mode: "generated-document",
    };
  }
  return { ...common, mode: overrides.mode ?? "editable" };
}

function createWorkspaceCodeSectionCommonData(
  overrides: WorkspaceCodeSectionDataOverrides,
): WorkspaceCodeSectionCommonData {
  return {
    code: overrides.code ?? "",
    diagnostics: overrides.diagnostics ?? [],
    language: overrides.language ?? "python",
    wrapLines: overrides.wrapLines ?? false,
    lineNumbers: overrides.lineNumbers ?? true,
    indentWidth:
      overrides.indentWidth ?? WORKSPACE_CODE_SECTION_DEFAULT_INDENT_WIDTH,
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
      `Code section ${sectionId} is missing its code section data.`,
    );
  }
  return data;
}

function assertDeclaredFields(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  mode: WorkspaceCodeSectionMode,
): void {
  for (const key of Object.keys(record)) {
    if (WORKSPACE_CODE_SECTION_COMMON_FIELDS.includes(key)) {
      continue;
    }
    if (key === WORKSPACE_GENERATED_REGION_FIELD) {
      if (mode === "generated-document") {
        continue;
      }
      throw new Error(
        `Code section ${sectionId} carries a generated region on its ${mode} mode.`,
      );
    }
    throw new Error(
      `Code section ${sectionId} carries the unknown field ${key}.`,
    );
  }
}

function getString(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(
      `Code section ${sectionId} is missing its string ${field} field.`,
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
      `Code section ${sectionId} is missing its boolean ${field} field.`,
    );
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

function getMode(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
): WorkspaceCodeSectionMode {
  const value = record["mode"];
  if (
    typeof value !== "string" ||
    !WORKSPACE_CODE_SECTION_MODES.includes(value as WorkspaceCodeSectionMode)
  ) {
    throw new Error(
      `Code section ${sectionId} needs one of the modes ` +
        `${WORKSPACE_CODE_SECTION_MODES.join(", ")}.`,
    );
  }
  return value as WorkspaceCodeSectionMode;
}

function getGeneratedRegion(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  code: string,
): WorkspaceGeneratedRegion {
  const value = record[WORKSPACE_GENERATED_REGION_FIELD];
  const requirement =
    `Code section ${sectionId} needs a generated region of integer from/to offsets ` +
    `where 0 <= from < to <= ${String(code.length)}.`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(requirement);
  }
  for (const key of Object.keys(value)) {
    if (!WORKSPACE_GENERATED_REGION_FIELDS.includes(key)) {
      throw new Error(
        `Code section ${sectionId} generated region carries the unknown field ${key}.`,
      );
    }
  }
  const region = readGeneratedRange(value["from"], value["to"], code.length);
  if (region === null) {
    throw new Error(requirement);
  }
  return region;
}

function getDiagnostics(
  sectionId: string,
  record: { [key: string]: WorkspaceSectionData },
  code: string,
): Array<WorkspaceCodeSectionDiagnostic> {
  const value = record["diagnostics"];
  if (!Array.isArray(value)) {
    throw new Error(`Code section ${sectionId} needs a diagnostics array.`);
  }
  return value.map((diagnostic, index) =>
    getDiagnostic(sectionId, diagnostic, index, code.length),
  );
}

function getDiagnostic(
  sectionId: string,
  value: WorkspaceSectionData,
  index: number,
  codeLength: number,
): WorkspaceCodeSectionDiagnostic {
  const field = `Code section ${sectionId} diagnostics[${String(index)}]`;
  const diagnostic = getDiagnosticRecord(value, field);
  const { from, to } = getDiagnosticRange(diagnostic, field, codeLength);
  return {
    from,
    to,
    severity: getDiagnosticSeverity(diagnostic, field),
    message: getDiagnosticMessage(diagnostic, field),
  };
}

function getDiagnosticRecord(
  value: WorkspaceSectionData,
  field: string,
): { [key: string]: WorkspaceSectionData } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!WORKSPACE_CODE_SECTION_DIAGNOSTIC_FIELDS.includes(key)) {
      throw new Error(`${field} carries the unknown field ${key}.`);
    }
  }
  if (WORKSPACE_CODE_SECTION_DIAGNOSTIC_FIELDS.some((key) => !(key in value))) {
    throw new Error(`${field} must contain its complete diagnostic fields.`);
  }
  return value;
}

function getDiagnosticRange(
  diagnostic: { [key: string]: WorkspaceSectionData },
  field: string,
  codeLength: number,
): { from: number; to: number } {
  const from = getDiagnosticOffset(
    diagnostic["from"],
    field,
    "from",
    codeLength,
  );
  const to = getDiagnosticOffset(diagnostic["to"], field, "to", codeLength);
  if (to < from) {
    throw new Error(`${field} to must not precede from.`);
  }
  return { from, to };
}

function getDiagnosticSeverity(
  diagnostic: { [key: string]: WorkspaceSectionData },
  field: string,
): WorkspaceCodeSectionDiagnosticSeverity {
  const severity = diagnostic["severity"];
  if (severity !== "error" && severity !== "warning" && severity !== "info") {
    throw new Error(`${field} has an unsupported severity.`);
  }
  return severity;
}

function getDiagnosticMessage(
  diagnostic: { [key: string]: WorkspaceSectionData },
  field: string,
): string {
  const message = diagnostic["message"];
  if (typeof message !== "string" || message.trim() === "") {
    throw new Error(`${field} needs a nonblank message.`);
  }
  return message;
}

function getDiagnosticOffset(
  value: WorkspaceSectionData | undefined,
  field: string,
  name: "from" | "to",
  codeLength: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > codeLength
  ) {
    throw new Error(
      `${field} ${name} must be an integer offset between 0 and ${String(codeLength)}.`,
    );
  }
  return value;
}

function readGeneratedRange(
  from: WorkspaceSectionData | undefined,
  to: WorkspaceSectionData | undefined,
  documentLength: number,
): WorkspaceGeneratedRegion | null {
  if (typeof from !== "number" || typeof to !== "number") {
    return null;
  }
  return Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    from < to &&
    to <= documentLength
    ? { from, to }
    : null;
}

export function parseWorkspaceCodeSectionData(
  sectionId: string,
  data: WorkspaceSectionData | undefined,
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage> = WORKSPACE_CODE_SECTION_LANGUAGES,
): WorkspaceCodeSectionData {
  const record = getDataRecord(sectionId, data);
  const mode = getMode(sectionId, record);
  assertDeclaredFields(sectionId, record, mode);
  const code = getString(sectionId, record, "code");
  const common: WorkspaceCodeSectionCommonData = {
    code,
    diagnostics: getDiagnostics(sectionId, record, code),
    language: getLanguage(sectionId, record, allowedLanguages),
    wrapLines: getBoolean(sectionId, record, "wrapLines"),
    lineNumbers: getBoolean(sectionId, record, "lineNumbers"),
    indentWidth: getIndentWidth(sectionId, record),
  };
  if (mode === "generated-document") {
    return {
      ...common,
      generatedRegion: getGeneratedRegion(sectionId, record, common.code),
      mode,
    };
  }
  return { ...common, mode };
}

export function getWorkspaceCodeSectionEditorLanguage(
  language: WorkspaceCodeSectionLanguage,
): WorkspaceEditorLanguage | null {
  return language === "plaintext" ? null : language;
}
