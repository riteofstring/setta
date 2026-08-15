import {
  createWorkspaceCodeSection,
  createWorkspaceTextSection,
  getWorkspaceCodeSectionData,
  getWorkspaceDocument,
  getWorkspaceTextSectionData,
  ItemDndContext,
  MetaControl,
  registerItemHandlers,
  registerSectionKinds,
  setItemControlConfiguration,
  setSectionData,
  setWorkspaceCodeSectionData,
  setWorkspaceTextSectionData,
  WORKSPACE_CODE_SECTION_KIND,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH,
  WORKSPACE_TEXT_SECTION_FORMATS,
  WORKSPACE_TEXT_SECTION_KIND,
  WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
  WorkspaceItemList,
  type ColorValueChoice,
  type DropzoneAcceptedResult,
  type DropzoneAttachment,
  type DropzonePolicy,
  type DropzoneRejection,
  type MetaControlDefinition,
  type MetaControlKind,
  type WorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
  type WorkspaceDropzoneItemControlConfiguration,
  type WorkspaceInspectorContributionContext,
  type WorkspaceItem,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceSection,
  type WorkspaceSectionData,
  type WorkspaceTextSectionData,
  type WorkspaceTextSectionFormat,
} from "@setta/workspace";
import { createContext, useContext, type ReactNode } from "react";
// The host side of the registration seam: the package owns the shell, chrome, header, and
// resize treatment; the playground registers its one leaf kind and renders the section body
// from the kind's opaque data. No icon is registered, so headers keep the reference's
// gg-menu fallback glyph from the accepted side-by-side.

function getLeafBody(section: WorkspaceSection): string {
  const data = section.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Leaf section ${section.id} is missing its body data.`);
  }
  const body = data["body"];
  if (typeof body !== "string") {
    throw new Error(`Leaf section ${section.id} is missing its body text.`);
  }
  return body;
}

function LeafSectionBody({ section }: { section: WorkspaceSection }) {
  return <p className="text-xs text-setta-500 dark:text-setta-400">{getLeafBody(section)}</p>;
}

function createPlaygroundCodeItem(): WorkspaceItem {
  const id = `item-${crypto.randomUUID()}`;
  return {
    id,
    children: [],
    presentation: {
      label: "parameter",
      labelEditable: true,
      control: {
        kind: "code",
        value: "",
        configuration: {
          autocomplete: "off",
          disabled: false,
          language: "python",
          placeholder: null,
          singleLine: false,
          wrapLines: true,
        },
      },
    },
  };
}

function PlaygroundInspectorContribution({
  context,
}: {
  context: WorkspaceInspectorContributionContext;
}) {
  const identity = context.type === "section" ? context.section.name : context.item.id;
  return (
    <div className="playground-host-pane">
      <p>Host Inspector contribution for {identity || "unnamed content"}.</p>
    </div>
  );
}

// The package owns the code section's data contract and its editor; the host owns any UI that
// authors those options. This contribution is that UI: it reads and writes the same typed data
// the editor commits through, so every option is reachable without a package-invented settings
// panel (frozen main's own code-area settings are entirely file-binding, which is application
// state this package does not carry).
function updatePlaygroundCodeSection(
  sectionId: string,
  update: (current: WorkspaceCodeSectionData) => WorkspaceCodeSectionData,
) {
  setWorkspaceCodeSectionData(sectionId, update(getWorkspaceCodeSectionData(sectionId)));
}

export function PlaygroundCodeSectionInspector({ sectionId }: { sectionId: string }) {
  const data = getWorkspaceCodeSectionData(sectionId);
  return (
    <div className="playground-host-pane">
      <fieldset className="playground-section-options">
        <legend>Editor options</legend>
        <label className="playground-section-option-row">
          <span>Language</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundCodeSection(sectionId, (current) => ({
                ...current,
                language: event.target.value as WorkspaceCodeSectionLanguage,
              }))
            }
            value={data.language}
          >
            {WORKSPACE_CODE_SECTION_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <label className="playground-section-option-row">
          <span>Wrap lines</span>
          <input
            checked={data.wrapLines}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(sectionId, (current) => ({
                ...current,
                wrapLines: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
        <label className="playground-section-option-row">
          <span>Line numbers</span>
          <input
            checked={data.lineNumbers}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(sectionId, (current) => ({
                ...current,
                lineNumbers: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
        <label className="playground-section-option-row">
          <span>Indent width</span>
          <input
            className="playground-section-option-control playground-section-option-number"
            max={WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH}
            min={WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH}
            onChange={(event) =>
              updatePlaygroundCodeSection(sectionId, (current) => ({
                ...current,
                indentWidth: Number(event.target.value),
              }))
            }
            type="number"
            value={data.indentWidth}
          />
        </label>
        <label className="playground-section-option-row">
          <span>Read only</span>
          <input
            checked={data.readOnly}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(sectionId, (current) => ({
                ...current,
                readOnly: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
      </fieldset>
    </div>
  );
}

// The text section's options are host UI over the same typed data the editor and the header
// control commit through, so no option needs a package-invented settings panel.
function updatePlaygroundTextSection(
  sectionId: string,
  update: (current: WorkspaceTextSectionData) => WorkspaceTextSectionData,
) {
  setWorkspaceTextSectionData(sectionId, update(getWorkspaceTextSectionData(sectionId)));
}

export function PlaygroundTextSectionInspector({ sectionId }: { sectionId: string }) {
  const data = getWorkspaceTextSectionData(sectionId);
  return (
    <div className="playground-host-pane">
      <fieldset className="playground-section-options">
        <legend>Text options</legend>
        <label className="playground-section-option-row">
          <span>Format</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundTextSection(sectionId, (current) => ({
                ...current,
                format: event.target.value as WorkspaceTextSectionFormat,
              }))
            }
            value={data.format}
          >
            {WORKSPACE_TEXT_SECTION_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>
        <label className="playground-section-option-row">
          <span>Font size</span>
          <input
            className="playground-section-option-control playground-section-option-number"
            max={WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE}
            min={WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE}
            onChange={(event) =>
              updatePlaygroundTextSection(sectionId, (current) => ({
                ...current,
                fontSizePx: Number(event.target.value),
              }))
            }
            type="number"
            value={data.fontSizePx}
          />
        </label>
        <label className="playground-section-option-row">
          <span>Read only</span>
          <input
            checked={data.readOnly}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundTextSection(sectionId, (current) => ({
                ...current,
                readOnly: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
      </fieldset>
    </div>
  );
}

// The item panel now mounts the package-owned typed row presentation directly. The host has no
// control decoder or row renderer; only browser/server side effects for the dropzone cross the
// explicit non-serializable handler registry.
export const PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS = {
  "item-alpha": [
    {
      severity: "error",
      message: "Use 0.0005 or less for the stability profile.",
    },
  ],
  "item-beta": [
    {
      severity: "warning",
      message: "Use less than 0.995 to reduce stale updates.",
    },
  ],
  "item-momentum": [
    {
      severity: "info",
      message: "This value applies after the first update.",
    },
  ],
} satisfies WorkspaceItemDiagnosticRegistry;

export const PLAYGROUND_UPDATED_ITEM_DIAGNOSTICS = {
  "item-alpha": [
    {
      severity: "warning",
      message: "The host accepted this value but recommends 0.0005 or less.",
    },
  ],
  "item-beta": [
    {
      severity: "error",
      message: "Use less than 0.998 before running this profile.",
    },
    {
      severity: "info",
      message: "This diagnostic update remains outside the workspace document.",
    },
  ],
} satisfies WorkspaceItemDiagnosticRegistry;

const PlaygroundItemDiagnosticsContext = createContext<WorkspaceItemDiagnosticRegistry>(
  PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
);

export function PlaygroundItemDiagnosticsProvider({
  children,
  diagnostics,
}: {
  children: ReactNode;
  diagnostics: WorkspaceItemDiagnosticRegistry;
}) {
  return (
    <PlaygroundItemDiagnosticsContext.Provider value={diagnostics}>
      {children}
    </PlaygroundItemDiagnosticsContext.Provider>
  );
}

function isColorValueChoice(candidate: WorkspaceSectionData): candidate is ColorValueChoice {
  return (
    candidate !== null &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    typeof candidate["color"] === "string" &&
    typeof candidate["description"] === "string"
  );
}

function getDropzoneAttachmentString(
  owner: { id: string },
  attachment: { [key: string]: WorkspaceSectionData },
  field: "id" | "name",
): string {
  const value = attachment[field];
  if (typeof value !== "string") {
    throw new Error(`${owner.id} has a malformed dropzone attachment ${field}.`);
  }
  return value;
}

function getDropzoneAttachmentKind(
  owner: { id: string },
  attachment: { [key: string]: WorkspaceSectionData },
): DropzoneAttachment["kind"] {
  const kind = attachment["kind"];
  if (kind !== "file" && kind !== "text") {
    throw new Error(`${owner.id} has a malformed dropzone attachment kind.`);
  }
  return kind;
}

function getDropzoneAttachmentSize(
  owner: { id: string },
  attachment: { [key: string]: WorkspaceSectionData },
): number | null {
  const size = attachment["size"];
  if (size !== null && typeof size !== "number") {
    throw new Error(`${owner.id} has a malformed dropzone attachment size.`);
  }
  return size;
}

function parseDropzoneAttachment(
  owner: { id: string },
  value: WorkspaceSectionData,
): DropzoneAttachment {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner.id} has a malformed dropzone attachment.`);
  }
  return {
    id: getDropzoneAttachmentString(owner, value, "id"),
    kind: getDropzoneAttachmentKind(owner, value),
    name: getDropzoneAttachmentString(owner, value, "name"),
    size: getDropzoneAttachmentSize(owner, value),
  };
}

let playgroundDropzoneAttachmentSequence = 0;

function createPlaygroundDropzoneAttachmentId(itemId: string): string {
  playgroundDropzoneAttachmentSequence += 1;
  return `${itemId}-attachment-${playgroundDropzoneAttachmentSequence}`;
}

function resolveAcceptedDropzoneAttachments(
  owner: { id: string },
  result: DropzoneAcceptedResult,
): Array<DropzoneAttachment> {
  if (result.kind === "text") {
    return [
      {
        id: createPlaygroundDropzoneAttachmentId(owner.id),
        kind: "text",
        name: "Dropped text",
        size: null,
      },
    ];
  }
  return result.files.map((file) => ({
    id: createPlaygroundDropzoneAttachmentId(owner.id),
    kind: "file" as const,
    name: file.name,
    size: file.size,
  }));
}

function describeDropzoneRejection(rejection: DropzoneRejection): string {
  if (rejection.reason === "attachment-count") {
    return "The attachment limit has been reached.";
  }
  if (rejection.reason === "file-size") {
    return `${rejection.kind === "file" ? rejection.file.name : "The drop"} is too large.`;
  }
  if (rejection.reason === "mime-type") {
    return `${rejection.file.name} has a disallowed file type.`;
  }
  return "The drop exceeds the total size limit.";
}

function getItemDropzoneConfiguration(): WorkspaceDropzoneItemControlConfiguration {
  const item = getWorkspaceDocument().sections["item-panel"]?.itemTree?.items["item-dropzone"];
  const control = item?.presentation?.control;
  if (!control || control.kind !== "dropzone") {
    throw new Error("The playground item-dropzone lost its typed dropzone presentation.");
  }
  return control.configuration;
}

function updateItemDropzoneConfiguration(
  update: (
    current: WorkspaceDropzoneItemControlConfiguration,
  ) => WorkspaceDropzoneItemControlConfiguration,
) {
  setItemControlConfiguration("item-panel", "item-dropzone", {
    kind: "dropzone",
    configuration: update(getItemDropzoneConfiguration()),
  });
}

function registerPlaygroundItemHandlers() {
  registerItemHandlers([
    {
      sectionId: "item-panel",
      itemId: "item-dropzone",
      kind: "dropzone",
      onAccepted: (result) =>
        updateItemDropzoneConfiguration((current) => ({
          ...current,
          attachments: [
            ...current.attachments,
            ...resolveAcceptedDropzoneAttachments({ id: "item-dropzone" }, result),
          ],
          errorMessage: null,
        })),
      onRejected: (rejections) => {
        const firstRejection = rejections[0];
        if (firstRejection) {
          updateItemDropzoneConfiguration((current) => ({
            ...current,
            errorMessage: describeDropzoneRejection(firstRejection),
          }));
        }
      },
      onServerFilePickerRequest: () =>
        updateItemDropzoneConfiguration((current) => ({
          ...current,
          attachments: [
            ...current.attachments,
            {
              id: createPlaygroundDropzoneAttachmentId("item-dropzone"),
              kind: "file",
              name: "server-example.csv",
              size: 2048,
            },
          ],
          errorMessage: null,
        })),
      onAttachmentRemove: (attachmentId) =>
        updateItemDropzoneConfiguration((current) => ({
          ...current,
          attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
          errorMessage: null,
        })),
    },
  ]);
}

export function ItemListSectionBody({ section }: { section: WorkspaceSection }) {
  const itemDiagnostics = useContext(PlaygroundItemDiagnosticsContext);
  const itemTree = section.itemTree;
  if (!itemTree) {
    throw new Error(`Item panel section ${section.id} is missing its item tree.`);
  }
  return (
    <ItemDndContext>
      <WorkspaceItemList
        sectionId={section.id}
        listKey="main"
        topLevelItemIds={itemTree.items[itemTree.rootId]?.children ?? []}
        itemDiagnostics={itemDiagnostics}
      />
    </ItemDndContext>
  );
}

function getMetaControlDataRecord(section: Pick<WorkspaceSection, "id" | "data">): {
  [key: string]: WorkspaceSectionData;
} {
  const data = section.data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Meta control section ${section.id} is missing its control data.`);
  }
  return data;
}

function getMetaControlKind(section: Pick<WorkspaceSection, "id" | "data">): MetaControlKind {
  const kind = getMetaControlDataRecord(section)["control"];
  const knownKinds: ReadonlyArray<MetaControlKind> = [
    "button",
    "color",
    "date",
    "dropdown",
    "dropzone",
    "password",
    "rotary",
    "slider",
    "switch",
    "text",
    "textarea",
    "time",
  ];
  if (typeof kind === "string" && knownKinds.includes(kind as MetaControlKind)) {
    return kind as MetaControlKind;
  }
  throw new Error(`Meta control section ${section.id} names the unknown control ${String(kind)}.`);
}

function getMetaControlString(section: WorkspaceSection, field: string): string {
  const value = getMetaControlDataRecord(section)[field];
  if (typeof value !== "string") {
    throw new Error(`Meta control section ${section.id} is missing its string ${field} field.`);
  }
  return value;
}

function getMetaControlBoolean(section: WorkspaceSection, field: string): boolean {
  const value = getMetaControlDataRecord(section)[field];
  if (typeof value !== "boolean") {
    throw new Error(`Meta control section ${section.id} is missing its boolean ${field} field.`);
  }
  return value;
}

function getMetaControlNumber(section: WorkspaceSection, field: string): number {
  const value = getMetaControlDataRecord(section)[field];
  if (typeof value !== "number") {
    throw new Error(`Meta control section ${section.id} is missing its numeric ${field} field.`);
  }
  return value;
}

function getMetaControlNullableNumber(section: WorkspaceSection, field: string): number | null {
  const value = getMetaControlDataRecord(section)[field];
  if (value !== null && typeof value !== "number") {
    throw new Error(`Meta control section ${section.id} has a malformed ${field} field.`);
  }
  return value;
}

function getMetaControlStringArray(section: WorkspaceSection, field: string): Array<string> {
  const value = getMetaControlDataRecord(section)[field];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Meta control section ${section.id} has a malformed ${field} field.`);
  }
  return value;
}

function getMetaControlOption<const Option extends string>(
  section: WorkspaceSection,
  field: string,
  options: ReadonlyArray<Option>,
): Option {
  const value = getMetaControlDataRecord(section)[field];
  if (typeof value !== "string" || !options.includes(value as Option)) {
    throw new Error(`Meta control section ${section.id} has an invalid ${field} field.`);
  }
  return value as Option;
}

function updateMetaControlData(
  sectionId: string,
  update: (current: { [key: string]: WorkspaceSectionData }) => {
    [key: string]: WorkspaceSectionData;
  },
) {
  const section = getWorkspaceDocument().sections[sectionId];
  if (!section) {
    throw new Error(`Unknown meta control section ${sectionId}.`);
  }
  setSectionData(sectionId, update(getMetaControlDataRecord(section)));
}

// Exported for the focused host-seam regression. The package reports an edit request; this
// unrelated host decides how that request changes its opaque section data.
export function commitPlaygroundMetaControlEditRequest(sectionId: string) {
  updateMetaControlData(sectionId, (current) => {
    const editRequests = current["editRequests"];
    if (typeof editRequests !== "number") {
      throw new Error(
        `Meta control section ${sectionId} is missing its numeric editRequests field.`,
      );
    }
    return { ...current, editRequests: editRequests + 1 };
  });
}

export function commitPlaygroundMetaControlValue(
  sectionId: string,
  expectedKind: Exclude<MetaControlKind, "button" | "dropzone">,
  value: string,
) {
  updateMetaControlData(sectionId, (current) => {
    if (current["control"] !== expectedKind) {
      throw new Error(`Meta control section ${sectionId} is not a ${expectedKind} control.`);
    }
    return { ...current, value };
  });
}

function getMetaControlColorChoices(
  section: WorkspaceSection,
): Array<ColorValueChoice> | undefined {
  const choices = getMetaControlDataRecord(section)["choices"];
  if (choices === undefined) {
    return undefined;
  }
  if (!Array.isArray(choices) || !choices.every(isColorValueChoice)) {
    throw new Error(`Meta control section ${section.id} has malformed color choices.`);
  }
  return choices;
}

function getMetaDropzoneAttachmentsFromData(
  sectionId: string,
  data: { [key: string]: WorkspaceSectionData },
): Array<DropzoneAttachment> {
  const attachments = data["attachments"];
  if (!Array.isArray(attachments)) {
    throw new Error(`Meta control section ${sectionId} has malformed dropzone attachments.`);
  }
  return attachments.map((attachment) =>
    parseDropzoneAttachment({ id: `Meta control section ${sectionId}` }, attachment),
  );
}

function getMetaDropzonePolicy(section: WorkspaceSection): DropzonePolicy {
  return {
    maxAttachments: getMetaControlNullableNumber(section, "maxAttachments"),
    maxFileBytes: getMetaControlNumber(section, "maxFileBytes"),
    maxTotalBytes: getMetaControlNullableNumber(section, "maxTotalBytes"),
    allowedMimePrefixes: getMetaControlStringArray(section, "allowedMimePrefixes"),
  };
}

function commitMetaDropzoneAccepted(section: WorkspaceSection, result: DropzoneAcceptedResult) {
  updateMetaControlData(section.id, (current) => ({
    ...current,
    attachments: [
      ...getMetaDropzoneAttachmentsFromData(section.id, current),
      ...resolveAcceptedDropzoneAttachments(section, result),
    ],
    errorMessage: "",
  }));
}

function buildButtonOrTextMetaControl(
  section: WorkspaceSection,
  kind: MetaControlKind,
): MetaControlDefinition | null {
  if (kind === "button") {
    return {
      kind,
      label: getMetaControlString(section, "label"),
      disabled: getMetaControlBoolean(section, "disabled"),
      pending: getMetaControlBoolean(section, "pending"),
      onAction: () =>
        updateMetaControlData(section.id, (current) => {
          const actionCount = current["actionCount"];
          if (typeof actionCount !== "number") {
            throw new Error(
              `Meta control section ${section.id} is missing its numeric actionCount field.`,
            );
          }
          return { ...current, actionCount: actionCount + 1 };
        }),
    };
  }
  if (kind === "text" || kind === "textarea") {
    return {
      kind,
      controlId: "value",
      ariaLabel: `${section.name} value`,
      value: getMetaControlString(section, "value"),
      language: "python",
      disabled: getMetaControlBoolean(section, "disabled"),
      onValueChange: (value) => commitPlaygroundMetaControlValue(section.id, kind, value),
    };
  }
  return null;
}

function buildNumericMetaControl(
  section: WorkspaceSection,
  kind: MetaControlKind,
): MetaControlDefinition | null {
  if (kind !== "slider" && kind !== "rotary") {
    return null;
  }
  return {
    kind,
    ariaLabel: `${section.name} value`,
    value: getMetaControlString(section, "value"),
    min: getMetaControlNumber(section, "min"),
    max: getMetaControlNumber(section, "max"),
    step: getMetaControlNumber(section, "step"),
    disabled: getMetaControlBoolean(section, "disabled"),
    onValueChange: (value) => commitPlaygroundMetaControlValue(section.id, kind, value),
  };
}

function buildChoiceMetaControl(
  section: WorkspaceSection,
  kind: MetaControlKind,
): MetaControlDefinition | null {
  if (kind !== "switch" && kind !== "color" && kind !== "dropdown") {
    return null;
  }
  const shared = {
    ariaLabel: `${section.name} value`,
    value: getMetaControlString(section, "value"),
    disabled: getMetaControlBoolean(section, "disabled"),
    onValueChange: (value: string) => commitPlaygroundMetaControlValue(section.id, kind, value),
  };
  if (kind === "switch") {
    return { kind, ...shared, label: getMetaControlString(section, "label") };
  }
  if (kind === "color") {
    return {
      kind,
      ...shared,
      controlId: "value",
      choices: getMetaControlColorChoices(section),
    };
  }
  return { kind, ...shared, choices: getMetaControlStringArray(section, "choices") };
}

function buildDateTimeMetaControl(
  section: WorkspaceSection,
  kind: MetaControlKind,
): MetaControlDefinition | null {
  if (kind !== "date" && kind !== "time") {
    return null;
  }
  const shared = {
    ariaLabel: `${section.name} value`,
    value: getMetaControlString(section, "value"),
    disabled: getMetaControlBoolean(section, "disabled"),
  };
  if (kind === "date") {
    return {
      kind,
      ...shared,
      displayFormat: getMetaControlOption(section, "displayFormat", ["iso", "us", "eu", "long"]),
      controlMode: getMetaControlOption(section, "controlMode", ["input", "calendar"]),
      selectionMode: getMetaControlOption(section, "selectionMode", ["single", "multiple"]),
      weekStart: getMetaControlOption(section, "weekStart", ["sunday", "monday"]),
      includeTime: getMetaControlBoolean(section, "includeTime"),
      timeDisplayFormat: getMetaControlOption(section, "timeDisplayFormat", [
        "twenty_four_hour",
        "twelve_hour",
      ]),
      onValueChange: (value) => commitPlaygroundMetaControlValue(section.id, kind, value),
    };
  }
  return {
    kind,
    ...shared,
    controlMode: getMetaControlOption(section, "controlMode", ["input", "display"]),
    displayFormat: getMetaControlOption(section, "displayFormat", [
      "twenty_four_hour",
      "twelve_hour",
    ]),
    transparent: getMetaControlBoolean(section, "transparent"),
    scale: getMetaControlNumber(section, "scale"),
    font: getMetaControlOption(section, "font", ["clock", "monospace", "system"]),
    onValueChange: (value) => commitPlaygroundMetaControlValue(section.id, kind, value),
  };
}

function buildPasswordOrDropzoneMetaControl(
  section: WorkspaceSection,
  kind: MetaControlKind,
): MetaControlDefinition | null {
  if (kind === "password") {
    return {
      kind,
      controlId: "value",
      ariaLabel: `${section.name} value`,
      value: getMetaControlString(section, "value"),
      disabled: getMetaControlBoolean(section, "disabled"),
      onValueChange: (value) => commitPlaygroundMetaControlValue(section.id, kind, value),
    };
  }
  if (kind !== "dropzone") {
    return null;
  }
  const attachments = getMetaDropzoneAttachmentsFromData(
    section.id,
    getMetaControlDataRecord(section),
  );
  const serverPicker = getMetaControlBoolean(section, "serverPicker");
  return {
    kind,
    controlId: "value",
    ariaLabel: `${section.name} dropzone`,
    attachments,
    policy: getMetaDropzonePolicy(section),
    placeholder: "Drop a file here",
    pending: getMetaControlBoolean(section, "pending"),
    errorMessage: getMetaControlString(section, "errorMessage") || undefined,
    disabled: getMetaControlBoolean(section, "disabled"),
    onAccepted: (result) => commitMetaDropzoneAccepted(section, result),
    onRejected: (rejections) => {
      const firstRejection = rejections[0];
      if (firstRejection) {
        updateMetaControlData(section.id, (current) => ({
          ...current,
          errorMessage: describeDropzoneRejection(firstRejection),
        }));
      }
    },
    onServerFilePickerRequest: serverPicker
      ? () =>
          updateMetaControlData(section.id, (current) => ({
            ...current,
            attachments: [
              ...getMetaDropzoneAttachmentsFromData(section.id, current),
              {
                id: createPlaygroundDropzoneAttachmentId(section.id),
                kind: "file",
                name: "server-example.csv",
                size: 2048,
              },
            ],
            errorMessage: "",
          }))
      : undefined,
    onAttachmentRemove: (attachmentId) =>
      updateMetaControlData(section.id, (current) => ({
        ...current,
        attachments: getMetaDropzoneAttachmentsFromData(section.id, current).filter(
          (attachment) => attachment.id !== attachmentId,
        ),
        errorMessage: "",
      })),
  };
}

function getPlaygroundMetaControl(section: WorkspaceSection): MetaControlDefinition {
  const kind = getMetaControlKind(section);
  const control =
    buildButtonOrTextMetaControl(section, kind) ??
    buildNumericMetaControl(section, kind) ??
    buildChoiceMetaControl(section, kind) ??
    buildDateTimeMetaControl(section, kind) ??
    buildPasswordOrDropzoneMetaControl(section, kind);
  if (!control) {
    throw new Error(`Meta control section ${section.id} has no adapter for ${kind}.`);
  }
  return control;
}

// The complete direct-on-canvas fixture is host-owned opaque data. The package composes every
// built-in control, while this unrelated host owns values, actions, validation, and file metadata.
export function MetaControlSectionBody({ section }: { section: WorkspaceSection }) {
  return (
    <MetaControl
      sectionId={section.id}
      sectionName={section.name}
      showSectionTitle={getMetaControlBoolean(section, "showSectionTitle")}
      control={getPlaygroundMetaControl(section)}
    />
  );
}

// Loading validates every non-group kind against the registry, so registration precedes the
// initial document load. Registered sizes describe the inner section surface; the shell adds
// a 1 px border on every side. The leaf's 200 x 122 renders the accepted 202 x 124 outer
// geometry, and the item panel's 550 x 350 renders the recorded 552 x 352 `/settings` Dict
// outer measurement from the Phase 4 gate.
export function registerPlaygroundSectionKinds(): void {
  registerPlaygroundItemHandlers();
  registerSectionKinds({
    leaf: {
      renderContent: (section) => <LeafSectionBody section={section} />,
      renderInspector: (context) => <PlaygroundInspectorContribution context={context} />,
      contentClassName: "px-1",
      defaultSize: { width: 200, height: 122 },
    },
    "item-list": {
      createItem: createPlaygroundCodeItem,
      renderContent: (section) => <ItemListSectionBody section={section} />,
      renderInspector: (context) => <PlaygroundInspectorContribution context={context} />,
      defaultSize: { width: 550, height: 350 },
    },
    "meta-control": {
      renderContent: (section) => <MetaControlSectionBody section={section} />,
      renderInspector: (context) => <PlaygroundInspectorContribution context={context} />,
      presentation: {
        type: "meta-control",
        resolveControlKind: getMetaControlKind,
        onEdit: (section) => commitPlaygroundMetaControlEditRequest(section.id),
      },
    },
    // The built-in Code Editor section composes with this host's own kinds through the same
    // registration call. Leaving it out would leave the workspace coherent; a document naming
    // the kind would then fail through the package's unknown-kind contract.
    [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
      renderInspector: (context) =>
        context.type === "section" ? (
          <PlaygroundCodeSectionInspector sectionId={context.section.id} />
        ) : null,
    }),
    // The built-in Text section registers the same way, and this host keeps both formats, both
    // display modes, and the package's header control.
    [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
      renderInspector: (context) =>
        context.type === "section" ? (
          <PlaygroundTextSectionInspector sectionId={context.section.id} />
        ) : null,
    }),
  });
}
