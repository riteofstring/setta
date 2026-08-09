import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  WorkspaceDocumentValidationError,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  validateSortableItemLists,
  validateWorkspaceViewportPresets,
  type SortableItemList,
  type SortableItemTree,
  type WorkspaceAppearance,
  type WorkspaceDocument,
  type WorkspaceJsonClipboardDataValidationRequest,
  type WorkspaceSection,
  type WorkspaceViewportPreset,
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

export type PlaygroundFieldItem =
  | Readonly<{ label: string; type: "group" }>
  | Readonly<{ label: string; type: "field"; value: string }>;

export type PlaygroundFieldListData = Readonly<{
  items: Readonly<Record<string, PlaygroundFieldItem>>;
  lists: readonly SortableItemList[];
  type: "field-list";
}>;

type PlaygroundGroupData = Readonly<{
  type: "group";
}>;

export type PlaygroundSectionData =
  PlaygroundFieldListData | PlaygroundGroupData | PlaygroundNoteData | PlaygroundStatusData;

export type PlaygroundPreferences = Readonly<{
  appearance: WorkspaceAppearance;
  gridSnap: boolean;
  gridVisible: boolean;
  viewportPresets: readonly WorkspaceViewportPreset[];
}>;

export type PlaygroundInitialState = Readonly<{
  document: WorkspaceDocument<PlaygroundSectionData>;
  firstRun: boolean;
  message: string;
  preferences: PlaygroundPreferences;
}>;

const PLAYGROUND_DOCUMENT_STORAGE_KEY = "setta-workspace-playground-document-v2";
const PLAYGROUND_PREFERENCES_STORAGE_KEY = "setta-workspace-playground-preferences-v1";

const PLAYGROUND_PREFERENCES_SCHEMA_VERSION = 2;

const DEFAULT_PLAYGROUND_PREFERENCES: PlaygroundPreferences = Object.freeze({
  appearance: "system",
  gridSnap: true,
  gridVisible: true,
  viewportPresets: Object.freeze([]),
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

function sectionSize(width: number, height: number) {
  return {
    height: { mode: "fixed" as const, value: height },
    width: { mode: "fixed" as const, value: width },
  };
}

type ExampleSectionOverrides = Partial<
  Pick<WorkspaceSection<PlaygroundSectionData>, "childLayout" | "presentation" | "size">
>;

function exampleSection(
  id: string,
  kind: string,
  title: string,
  data: PlaygroundSectionData,
  overrides: ExampleSectionOverrides = {},
): WorkspaceSection<PlaygroundSectionData> {
  return {
    childLayout: null,
    data,
    id,
    isMinimized: false,
    kind,
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: sectionSize(320, 220),
    title,
    ...overrides,
  };
}

export function createPlaygroundExampleDocument(): WorkspaceDocument<PlaygroundSectionData> {
  return {
    rootSections: [
      { position: { x: 72, y: 72 }, sectionId: "example-note" },
      { position: { x: 72, y: 320 }, sectionId: "example-status" },
      { position: { x: 420, y: 48 }, sectionId: "example-onboarding" },
      { position: { x: 816, y: 72 }, sectionId: "example-fields" },
      { position: { x: 72, y: 560 }, sectionId: "example-ideas" },
    ],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {
      "example-fields": exampleSection(
        "example-fields",
        "sample-field-list",
        "Profile fields",
        createPlaygroundFieldListData(),
        {
          presentation: {
            accentColor: "oklch(0.62 0.13 305)",
            chrome: "default",
            tagColor: null,
          },
          size: sectionSize(440, 520),
        },
      ),
      "example-ideas": exampleSection(
        "example-ideas",
        "sample-group",
        "Follow-ups",
        { type: "group" },
        {
          childLayout: {
            overflow: "grow",
            positioning: "freeform",
            positions: { "ideas-followup": { x: 24, y: 20 } },
            sectionIds: ["ideas-followup"],
          },
          size: sectionSize(320, 290),
        },
      ),
      "example-note": exampleSection(
        "example-note",
        "sample-note",
        "Welcome note",
        {
          body: "Drag sections by their headers, nest them into the onboarding group, and reload to restore your changes.",
          type: "note",
        },
        {
          presentation: {
            accentColor: "oklch(0.62 0.14 255)",
            chrome: "default",
            tagColor: null,
          },
          size: sectionSize(300, 190),
        },
      ),
      "example-onboarding": exampleSection(
        "example-onboarding",
        "sample-group",
        "Customer onboarding",
        { type: "group" },
        {
          childLayout: {
            orientation: "vertical",
            overflow: "grow",
            positioning: "ordered",
            sectionIds: ["onboarding-invite", "onboarding-details", "onboarding-handoff"],
          },
          presentation: {
            accentColor: null,
            chrome: "default",
            tagColor: "oklch(0.72 0.11 80)",
          },
          size: {
            height: { mode: "content", value: 520 },
            width: { mode: "fixed", value: 380 },
          },
        },
      ),
      "example-status": exampleSection(
        "example-status",
        "sample-status",
        "Workspace status",
        { count: 3, label: "onboarding steps ready", type: "status" },
        {
          presentation: {
            accentColor: "oklch(0.64 0.1 195)",
            chrome: "compact",
            tagColor: "oklch(0.64 0.11 145)",
          },
          size: sectionSize(260, 150),
        },
      ),
      "handoff-checks": exampleSection(
        "handoff-checks",
        "sample-status",
        "Checks",
        { count: 2, label: "handoff checks", type: "status" },
        {
          presentation: { accentColor: null, chrome: "compact", tagColor: null },
          size: sectionSize(150, 140),
        },
      ),
      "handoff-recap": exampleSection(
        "handoff-recap",
        "sample-note",
        "Recap",
        { body: "Write the kickoff recap.", type: "note" },
        { size: sectionSize(150, 140) },
      ),
      "ideas-followup": exampleSection(
        "ideas-followup",
        "sample-note",
        "Schedule check-in",
        { body: "Drag this note anywhere in this group.", type: "note" },
        { size: sectionSize(210, 175) },
      ),
      "onboarding-details": exampleSection(
        "onboarding-details",
        "sample-note",
        "Collect account details",
        { body: "Record the contact, plan, and billing owner.", type: "note" },
        { size: sectionSize(340, 110) },
      ),
      "onboarding-handoff": exampleSection(
        "onboarding-handoff",
        "sample-group",
        "Handoff",
        { type: "group" },
        {
          childLayout: {
            orientation: "horizontal",
            overflow: "grow",
            positioning: "ordered",
            sectionIds: ["handoff-recap", "handoff-checks"],
          },
          size: {
            height: { mode: "content", value: 210 },
            width: { mode: "fixed", value: 340 },
          },
        },
      ),
      "onboarding-invite": exampleSection(
        "onboarding-invite",
        "sample-note",
        "Invite the customer",
        { body: "Send the workspace invite and confirm access.", type: "note" },
        { size: sectionSize(340, 110) },
      ),
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function createPlaygroundFieldListData(): PlaygroundFieldListData {
  return {
    items: {
      email: { label: "Email", type: "field", value: "ada@example.com" },
      name: { label: "Name", type: "field", value: "Ada Lovelace" },
      notes: { label: "Notes", type: "field", value: "First programmer" },
      preferences: { label: "Preferences", type: "group" },
      theme: { label: "Theme", type: "field", value: "System" },
    },
    lists: [
      {
        label: "Required fields",
        listId: "required-fields",
        tree: {
          childrenByParent: {
            "required-fields-root": ["name", "email", "preferences"],
            preferences: ["theme"],
          },
          itemIds: ["name", "email", "preferences", "theme"],
          rootId: "required-fields-root",
        },
      },
      {
        label: "Optional fields",
        listId: "optional-fields",
        tree: {
          childrenByParent: { "optional-fields-root": ["notes"] },
          itemIds: ["notes"],
          rootId: "optional-fields-root",
        },
      },
    ],
    type: "field-list",
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

function validateGroupData(
  value: unknown,
  sectionId: string,
): asserts value is PlaygroundGroupData {
  const label = `Group data for ${JSON.stringify(sectionId)}`;
  const record = plainRecord(value, label);
  assertExactKeys(record, ["type"], label);
  if (record.type !== "group") {
    throw new PlaygroundDocumentPayloadError(`${label} must use the group type.`);
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

function validateFieldItem(value: unknown, itemId: string): PlaygroundFieldItem {
  const label = `Field-list item ${JSON.stringify(itemId)}`;
  const record = plainRecord(value, label);
  if (record.type === "group") {
    assertExactKeys(record, ["label", "type"], label);
    if (typeof record.label !== "string" || record.label.trim().length === 0) {
      throw new PlaygroundDocumentPayloadError(`${label} must contain a non-empty label.`);
    }
    return record as PlaygroundFieldItem;
  }
  assertExactKeys(record, ["label", "type", "value"], label);
  if (
    record.type !== "field" ||
    typeof record.label !== "string" ||
    record.label.trim().length === 0 ||
    typeof record.value !== "string"
  ) {
    throw new PlaygroundDocumentPayloadError(
      `${label} must contain a field type, non-empty label, and text value.`,
    );
  }
  return record as PlaygroundFieldItem;
}

function validateFieldListContainment(
  tree: SortableItemTree,
  items: ReadonlyMap<string, PlaygroundFieldItem>,
): void {
  for (const [parentId, children] of Object.entries(tree.childrenByParent)) {
    if (parentId !== tree.rootId && children.length > 0 && items.get(parentId)?.type !== "group") {
      throw new PlaygroundDocumentPayloadError(
        `Field-list item ${JSON.stringify(parentId)} must be a group before it can contain children.`,
      );
    }
  }
}

function validateFieldListData(
  value: unknown,
  sectionId: string,
): asserts value is PlaygroundFieldListData {
  const label = `Field-list data for ${JSON.stringify(sectionId)}`;
  const record = plainRecord(value, label);
  assertExactKeys(record, ["items", "lists", "type"], label);
  if (record.type !== "field-list") {
    throw new PlaygroundDocumentPayloadError(`${label} must use the field-list type.`);
  }
  try {
    validateSortableItemLists(record.lists);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new PlaygroundDocumentPayloadError(`${label} has invalid item lists: ${error.message}`);
    }
    throw error;
  }
  const items = plainRecord(record.items, `${label} items`);
  const itemIds = new Set(record.lists.flatMap((list) => list.tree.itemIds));
  const itemKeys = Object.keys(items);
  if (itemKeys.length !== itemIds.size || itemKeys.some((itemId) => !itemIds.has(itemId))) {
    throw new PlaygroundDocumentPayloadError(
      `${label} items must match the sortable tree item IDs exactly.`,
    );
  }
  const validatedItems = new Map(
    itemKeys.map((itemId) => [itemId, validateFieldItem(items[itemId], itemId)] as const),
  );
  record.lists.forEach((list) => validateFieldListContainment(list.tree, validatedItems));
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
    if (section.kind === "sample-field-list") {
      validateFieldListData(section.data, sectionId);
      continue;
    }
    if (section.kind === "sample-group") {
      validateGroupData(section.data, sectionId);
      continue;
    }
    throw new PlaygroundDocumentPayloadError(
      `Section ${JSON.stringify(sectionId)} uses unsupported kind ${JSON.stringify(section.kind)}.`,
    );
  }
}

export function validatePlaygroundClipboardSectionData({
  data,
  kind,
  sourceSectionId,
}: WorkspaceJsonClipboardDataValidationRequest): boolean {
  if (kind === "sample-note") {
    validateNoteData(data, sourceSectionId);
    return true;
  }
  if (kind === "sample-status") {
    validateStatusData(data, sourceSectionId);
    return true;
  }
  if (kind === "sample-field-list") {
    validateFieldListData(data, sourceSectionId);
    return true;
  }
  if (kind === "sample-group") {
    validateGroupData(data, sourceSectionId);
    return true;
  }
  return false;
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
    viewportPresets: preferenceViewportPresets(record.viewportPresets),
  };
}

function assertPreferenceFields(record: Record<string, unknown>): void {
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    "appearance",
    "gridSnap",
    "gridVisible",
    "schemaVersion",
    "viewportPresets",
  ];
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

function preferenceViewportPresets(value: unknown): readonly WorkspaceViewportPreset[] {
  try {
    validateWorkspaceViewportPresets(value);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new PlaygroundPreferencesError(
        `Saved workspace viewport presets are invalid. ${error.message}`,
      );
    }
    throw error;
  }
  return value.map((preset) => ({ ...preset, viewport: { ...preset.viewport } }));
}

function plainPreferencesRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlaygroundPreferencesError("Saved workspace preferences must be an object.");
  }
  return value as Record<string, unknown>;
}

function loadStoredDocument(storage: Storage): Readonly<{
  document: WorkspaceDocument<PlaygroundSectionData>;
  firstRun: boolean;
  message: string;
}> {
  const serialized = storage.getItem(PLAYGROUND_DOCUMENT_STORAGE_KEY);
  if (serialized === null) {
    return { document: createPlaygroundExampleDocument(), firstRun: true, message: "" };
  }
  try {
    return { document: parsePlaygroundDocument(serialized), firstRun: false, message: "" };
  } catch (error) {
    return {
      document: createPlaygroundExampleDocument(),
      firstRun: true,
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
      firstRun: storedDocument.firstRun,
      message: [storedDocument.message, storedPreferences.message].filter(Boolean).join(" "),
      preferences: storedPreferences.preferences,
    };
  } catch (error) {
    if (!storageUnavailable(error)) {
      throw error;
    }
    return {
      document: createPlaygroundExampleDocument(),
      firstRun: true,
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
  validateWorkspaceViewportPresets(preferences.viewportPresets);
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
