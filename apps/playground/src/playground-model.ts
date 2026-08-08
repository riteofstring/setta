import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  WorkspaceDocumentValidationError,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  type WorkspaceAppearance,
  type WorkspaceDocument,
} from "@setta/workspace/core";

export type PlaygroundNoteData = Readonly<{
  body: string;
  type: "note";
}>;

export type PlaygroundStatusData = Readonly<{
  count: number;
  label: string;
  type: "status";
}>;

export type PlaygroundSectionData = PlaygroundNoteData | PlaygroundStatusData;

export type PlaygroundPreferences = Readonly<{
  appearance: WorkspaceAppearance;
  gridSnap: boolean;
  gridVisible: boolean;
}>;

export type PlaygroundInitialState = Readonly<{
  document: WorkspaceDocument<PlaygroundSectionData>;
  message: string;
  preferences: PlaygroundPreferences;
}>;

const PLAYGROUND_DOCUMENT_STORAGE_KEY = "setta-workspace-playground-document-v1";
const PLAYGROUND_PREFERENCES_STORAGE_KEY = "setta-workspace-playground-preferences-v1";

const PLAYGROUND_PREFERENCES_SCHEMA_VERSION = 1;

const DEFAULT_PLAYGROUND_PREFERENCES: PlaygroundPreferences = Object.freeze({
  appearance: "system",
  gridSnap: true,
  gridVisible: true,
});

class PlaygroundDocumentPayloadError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "PlaygroundDocumentPayloadError";
  }
}

class PlaygroundPreferencesError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "PlaygroundPreferencesError";
  }
}

function emptyPlaygroundDocument(): WorkspaceDocument<PlaygroundSectionData> {
  return {
    rootSections: [],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function sectionSize(width: number, height: number) {
  return {
    height: { mode: "fixed" as const, value: height },
    width: { mode: "fixed" as const, value: width },
  };
}

export function createPlaygroundExampleDocument(): WorkspaceDocument<PlaygroundSectionData> {
  return {
    rootSections: [
      { position: { x: 72, y: 72 }, sectionId: "example-note" },
      { position: { x: 456, y: 132 }, sectionId: "example-status" },
    ],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {
      "example-note": {
        childLayout: null,
        data: {
          body: "Arrange sections freely, then export this workspace or reload it from local storage.",
          type: "note",
        },
        id: "example-note",
        isMinimized: false,
        kind: "sample-note",
        positionAndSizeLocked: false,
        presentation: {
          accentColor: "oklch(0.62 0.14 255)",
          chrome: "default",
          tagColor: null,
        },
        size: sectionSize(320, 240),
        title: "Welcome note",
      },
      "example-status": {
        childLayout: null,
        data: { count: 3, label: "workspace checks ready", type: "status" },
        id: "example-status",
        isMinimized: false,
        kind: "sample-status",
        positionAndSizeLocked: false,
        presentation: {
          accentColor: "oklch(0.64 0.1 195)",
          chrome: "compact",
          tagColor: "oklch(0.64 0.11 145)",
        },
        size: sectionSize(280, 200),
        title: "Workspace status",
      },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlaygroundDocumentPayloadError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new PlaygroundDocumentPayloadError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new PlaygroundDocumentPayloadError(
      `${label} must contain exactly ${expected.join(", ")}.`,
    );
  }
}

function validateNoteData(value: unknown, sectionId: string): asserts value is PlaygroundNoteData {
  const label = `Note data for ${JSON.stringify(sectionId)}`;
  const record = plainRecord(value, label);
  assertExactKeys(record, ["body", "type"], label);
  if (record.type !== "note" || typeof record.body !== "string") {
    throw new PlaygroundDocumentPayloadError(`${label} must contain a note type and text body.`);
  }
}

function validateStatusData(
  value: unknown,
  sectionId: string,
): asserts value is PlaygroundStatusData {
  const label = `Status data for ${JSON.stringify(sectionId)}`;
  const record = plainRecord(value, label);
  assertExactKeys(record, ["count", "label", "type"], label);
  if (
    record.type !== "status" ||
    typeof record.label !== "string" ||
    typeof record.count !== "number" ||
    !Number.isSafeInteger(record.count)
  ) {
    throw new PlaygroundDocumentPayloadError(
      `${label} must contain a status type, text label, and safe integer count.`,
    );
  }
}

function validatePlaygroundPayloads(document: WorkspaceDocument<unknown>): void {
  for (const [sectionId, section] of Object.entries(document.sections)) {
    if (section.kind === "sample-note") {
      validateNoteData(section.data, sectionId);
      continue;
    }
    if (section.kind === "sample-status") {
      validateStatusData(section.data, sectionId);
      continue;
    }
    throw new PlaygroundDocumentPayloadError(
      `Section ${JSON.stringify(sectionId)} uses unsupported kind ${JSON.stringify(section.kind)}.`,
    );
  }
}

export function parsePlaygroundDocument(
  serialized: string,
): WorkspaceDocument<PlaygroundSectionData> {
  const document = parseWorkspaceDocument(serialized);
  validatePlaygroundPayloads(document);
  return document as WorkspaceDocument<PlaygroundSectionData>;
}

export function formatPlaygroundDocument(
  document: WorkspaceDocument<PlaygroundSectionData>,
): string {
  serializeWorkspaceDocument(document);
  return JSON.stringify(document, null, 2);
}

export function playgroundImportErrorMessage(error: unknown): string {
  if (error instanceof WorkspaceDocumentValidationError) {
    if (error.code === "invalid-json") {
      return "Enter valid JSON, then import it again.";
    }
    if (error.code === "unsupported-schema-version") {
      return `Use workspace schema version ${String(WORKSPACE_DOCUMENT_SCHEMA_VERSION)}, then import it again.`;
    }
    return `Correct ${error.message}, then import it again.`;
  }
  if (error instanceof PlaygroundDocumentPayloadError) {
    return `${error.message} Correct the section data, then import it again.`;
  }
  throw error;
}

function parsePreferences(serialized: string): PlaygroundPreferences {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new PlaygroundPreferencesError("Saved workspace preferences are not valid JSON.");
    }
    throw error;
  }
  const record = plainPreferencesRecord(value);
  assertPreferenceFields(record);
  return {
    appearance: preferenceAppearance(record.appearance),
    gridSnap: preferenceBoolean(record.gridSnap, "grid snap"),
    gridVisible: preferenceBoolean(record.gridVisible, "grid visibility"),
  };
}

function assertPreferenceFields(record: Record<string, unknown>): void {
  const keys = Object.keys(record).sort();
  const expectedKeys = ["appearance", "gridSnap", "gridVisible", "schemaVersion"];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new PlaygroundPreferencesError("Saved workspace preferences have unknown fields.");
  }
  if (record.schemaVersion !== PLAYGROUND_PREFERENCES_SCHEMA_VERSION) {
    throw new PlaygroundPreferencesError("Saved workspace preferences use an unsupported version.");
  }
}

function preferenceAppearance(value: unknown): WorkspaceAppearance {
  if (value !== "dark" && value !== "light" && value !== "system") {
    throw new PlaygroundPreferencesError("Saved workspace appearance is invalid.");
  }
  return value;
}

function preferenceBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new PlaygroundPreferencesError(`Saved workspace ${label} preference is invalid.`);
  }
  return value;
}

function plainPreferencesRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlaygroundPreferencesError("Saved workspace preferences must be an object.");
  }
  return value as Record<string, unknown>;
}

function loadStoredDocument(storage: Storage): Readonly<{
  document: WorkspaceDocument<PlaygroundSectionData>;
  message: string;
}> {
  const serialized = storage.getItem(PLAYGROUND_DOCUMENT_STORAGE_KEY);
  if (serialized === null) {
    return { document: emptyPlaygroundDocument(), message: "" };
  }
  try {
    return { document: parsePlaygroundDocument(serialized), message: "" };
  } catch (error) {
    return {
      document: emptyPlaygroundDocument(),
      message: `Saved workspace could not be restored. ${playgroundImportErrorMessage(error)}`,
    };
  }
}

function loadStoredPreferences(storage: Storage): Readonly<{
  message: string;
  preferences: PlaygroundPreferences;
}> {
  const serialized = storage.getItem(PLAYGROUND_PREFERENCES_STORAGE_KEY);
  if (serialized === null) {
    return { message: "", preferences: DEFAULT_PLAYGROUND_PREFERENCES };
  }
  try {
    return { message: "", preferences: parsePreferences(serialized) };
  } catch (error) {
    if (!(error instanceof PlaygroundPreferencesError)) {
      throw error;
    }
    return {
      message: `${error.message} Default preferences are active.`,
      preferences: DEFAULT_PLAYGROUND_PREFERENCES,
    };
  }
}

function storageUnavailable(error: unknown): boolean {
  return error instanceof DOMException;
}

export function loadPlaygroundState(): PlaygroundInitialState {
  try {
    const storage = window.localStorage;
    const storedDocument = loadStoredDocument(storage);
    const storedPreferences = loadStoredPreferences(storage);
    return {
      document: storedDocument.document,
      message: [storedDocument.message, storedPreferences.message].filter(Boolean).join(" "),
      preferences: storedPreferences.preferences,
    };
  } catch (error) {
    if (!storageUnavailable(error)) {
      throw error;
    }
    return {
      document: emptyPlaygroundDocument(),
      message: "Local persistence is unavailable. Changes remain in this tab.",
      preferences: DEFAULT_PLAYGROUND_PREFERENCES,
    };
  }
}

export function persistPlaygroundDocument(
  document: WorkspaceDocument<PlaygroundSectionData>,
): string | null {
  try {
    window.localStorage.setItem(
      PLAYGROUND_DOCUMENT_STORAGE_KEY,
      serializeWorkspaceDocument(document),
    );
    return null;
  } catch (error) {
    if (storageUnavailable(error)) {
      return "Workspace changes could not be saved locally. They remain in this tab.";
    }
    throw error;
  }
}

export function persistPlaygroundPreferences(preferences: PlaygroundPreferences): string | null {
  try {
    window.localStorage.setItem(
      PLAYGROUND_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...preferences,
        schemaVersion: PLAYGROUND_PREFERENCES_SCHEMA_VERSION,
      }),
    );
    return null;
  } catch (error) {
    if (storageUnavailable(error)) {
      return "Workspace preferences could not be saved locally. They remain in this tab.";
    }
    throw error;
  }
}
