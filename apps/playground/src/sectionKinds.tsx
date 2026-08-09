import {
  ColorValueControl,
  DateValueControl,
  DropdownValueControl,
  DropzoneValueControl,
  getWorkspaceDocument,
  ItemDndContext,
  ItemNameEditor,
  MetaControl,
  PasswordValueControl,
  registerSectionKinds,
  RotaryValueControl,
  setItemData,
  setSectionData,
  SliderValueControl,
  SwitchValueControl,
  TextValueEditor,
  TimeValueControl,
  WorkspaceItemLabel,
  WorkspaceItemList,
  type ColorValueChoice,
  type DropzoneAcceptedResult,
  type DropzoneAttachment,
  type DropzonePolicy,
  type DropzoneRejection,
  type ItemRowRenderContext,
  type MetaControlDefinition,
  type MetaControlKind,
  type WorkspaceItem,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@setta/workspace";
import { useEffect, useState } from "react";

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

// The host side of the registered item surface: the item panel kind mounts the package's
// per-section item drag context and one item list, names the list, supplies list membership
// from the canonical tree, and renders row content from this host's opaque item data. The
// group flag in that data drives the parent-row layout, so an emptied group keeps its chrome.
// The package owns the list-area shell (the named nested grid, scrolling, and row rhythm);
// the host only places the area in the section grid and gives it a column to fill.
function getItemDataRecord(item: WorkspaceItem): { [key: string]: WorkspaceSectionData } {
  const data = item.data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Item ${item.id} is missing its row data.`);
  }
  return data;
}

function getItemField(item: WorkspaceItem, field: string): string | boolean | undefined {
  const value = getItemDataRecord(item)[field];
  if (value !== undefined && typeof value !== "string" && typeof value !== "boolean") {
    throw new Error(`Item ${item.id} has a malformed ${field} field.`);
  }
  return value;
}

function getItemValue(item: WorkspaceItem): string {
  const value = getItemField(item, "value");
  if (typeof value !== "string") {
    throw new Error(`Item ${item.id} is missing its string value.`);
  }
  return value;
}

function getItemLabel(item: WorkspaceItem): string {
  const label = getItemField(item, "label");
  if (typeof label !== "string") {
    throw new Error(`Item ${item.id} is missing its string label.`);
  }
  return label;
}

function getItemNumber(item: WorkspaceItem, field: string): number {
  const value = getItemDataRecord(item)[field];
  if (typeof value !== "number") {
    throw new Error(`Item ${item.id} is missing its numeric ${field} field.`);
  }
  return value;
}

function getItemBoolean(item: WorkspaceItem, field: string): boolean {
  const value = getItemDataRecord(item)[field];
  if (typeof value !== "boolean") {
    throw new Error(`Item ${item.id} is missing its boolean ${field} field.`);
  }
  return value;
}

function getItemOption<const Option extends string>(
  item: WorkspaceItem,
  field: string,
  options: ReadonlyArray<Option>,
): Option {
  const value = getItemDataRecord(item)[field];
  if (typeof value !== "string" || !options.includes(value as Option)) {
    throw new Error(`Item ${item.id} has an invalid ${field} field.`);
  }
  return value as Option;
}

function isGroupItem(item: WorkspaceItem): boolean {
  return getItemField(item, "group") === true;
}

// The host-owned presentation contract, the domain-neutral equivalent of the frozen
// `/settings` Dict's label and value roles. Labels carry the reference `ParamTextLabel`
// treatment verbatim (12/16 px semibold sans-serif in setta-800/200 with the reference's
// 0.125 rem vertical padding); its click-to-focus affordance stays application-side with the
// input it focuses. Values mount the package's built-in controls from the item-controls
// milestone, chosen by this host's opaque `control` field: the two-layer text value editor
// (the default, at python — the reference settings surface's generated `configLanguage`), the
// boolean switch, slider, rotary, date, time, password, the dropdown over this host's flat choice
// strings, multiline text through the same wrapped editor path, the backend-free dropzone, and the
// color picker in both its configured-choices and native-input forms. The captured `rename_me`
// row composes the package's editable name control; this host validates proposed names against
// its opaque sibling labels and owns whether a proposal commits.
// The playground owns persistence: accepted changes commit back into this host's opaque item
// data through the `setItemData` funnel. Value controls need no fixture validation; the name
// seam applies the sibling rule above. The reference's debounced transport and backend paths
// have no playground equivalent.
const ITEM_LABEL_CLASS_NAME =
  "truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200";
const ITEM_VALUE_LANGUAGE = "python";

function commitItemValue(context: ItemRowRenderContext, nextValue: string) {
  setItemData(context.sectionId, context.item.id, {
    ...getItemDataRecord(context.item),
    value: nextValue,
  });
}

function commitItemName(context: ItemRowRenderContext, nextName: string) {
  setItemData(context.sectionId, context.item.id, {
    ...getItemDataRecord(context.item),
    label: nextName,
  });
}

function getItemTreeForSection(sectionId: string) {
  const itemTree = getWorkspaceDocument().sections[sectionId]?.itemTree;
  if (!itemTree) {
    throw new Error(`Section ${sectionId} is missing its item tree.`);
  }
  return itemTree;
}

function getItemParentId(sectionId: string, itemId: string): string {
  const itemTree = getItemTreeForSection(sectionId);
  for (const [parentId, parent] of Object.entries(itemTree.items)) {
    if (parent.children.includes(itemId)) {
      return parentId;
    }
  }
  throw new Error(`Item ${itemId} has no parent in section ${sectionId}.`);
}

function getDuplicateItemNameError(context: ItemRowRenderContext, proposedName: string): string {
  const normalizedName = proposedName.trim();
  if (!normalizedName) {
    return "";
  }
  const itemTree = getItemTreeForSection(context.sectionId);
  const parentId = getItemParentId(context.sectionId, context.item.id);
  const parent = itemTree.items[parentId];
  if (!parent) {
    throw new Error(`Item parent ${parentId} is missing from section ${context.sectionId}.`);
  }
  const hasDuplicate = parent.children.some((siblingId) => {
    if (siblingId === context.item.id) {
      return false;
    }
    const sibling = itemTree.items[siblingId];
    if (!sibling) {
      throw new Error(`Sibling item ${siblingId} is missing from section ${context.sectionId}.`);
    }
    return getItemLabel(sibling).trim() === normalizedName;
  });
  return hasDuplicate ? `Param name "${normalizedName}" already exists under this parent.` : "";
}

// Exported only for the focused host-seam regression. The package reports proposals; this
// unrelated host decides whether its opaque label data accepts one.
export function commitPlaygroundItemNameProposal(
  context: ItemRowRenderContext,
  proposedName: string,
): string {
  const errorMessage = getDuplicateItemNameError(context, proposedName);
  if (!errorMessage) {
    commitItemName(context, proposedName);
  }
  return errorMessage;
}

function EditableItemName({
  context,
  hasChildren,
}: {
  context: ItemRowRenderContext;
  hasChildren: boolean;
}) {
  const committedName = getItemLabel(context.item);
  const [proposedName, setProposedName] = useState(committedName);
  useEffect(() => {
    setProposedName(committedName);
  }, [committedName]);
  const errorMessage = getDuplicateItemNameError(context, proposedName);
  return (
    <ItemNameEditor
      sectionId={context.sectionId}
      itemId={context.item.id}
      name={proposedName}
      language={ITEM_VALUE_LANGUAGE}
      hasChildren={hasChildren}
      errorMessage={errorMessage}
      onNameChange={(nextName) => {
        setProposedName(nextName);
        commitPlaygroundItemNameProposal(context, nextName);
      }}
      onBlur={() => setProposedName(committedName)}
    />
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

function getItemColorChoices(item: WorkspaceItem): Array<ColorValueChoice> | undefined {
  const choices = getItemDataRecord(item)["choices"];
  if (choices === undefined) {
    return undefined;
  }
  if (!Array.isArray(choices) || !choices.every(isColorValueChoice)) {
    throw new Error(`Item ${item.id} has malformed color choices.`);
  }
  return choices;
}

// This host supplies flat choice strings, mirroring the captured Alpha/Beta/Gamma fixture;
// the package wraps them in the reference's single "Choices" group header.
function getItemDropdownChoices(item: WorkspaceItem): Array<string> {
  const choices = getItemDataRecord(item)["choices"];
  if (!Array.isArray(choices) || !choices.every((choice) => typeof choice === "string")) {
    throw new Error(`Item ${item.id} has malformed dropdown choices.`);
  }
  return choices;
}

function getItemNullableNumber(item: WorkspaceItem, field: string): number | null {
  const value = getItemDataRecord(item)[field];
  if (value !== null && typeof value !== "number") {
    throw new Error(`Item ${item.id} has a malformed ${field} field.`);
  }
  return value;
}

function getItemStringArray(item: WorkspaceItem, field: string): Array<string> {
  const value = getItemDataRecord(item)[field];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Item ${item.id} has a malformed ${field} field.`);
  }
  return value;
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

function getItemDropzoneAttachments(item: WorkspaceItem): Array<DropzoneAttachment> {
  const attachments = getItemDataRecord(item)["attachments"];
  if (!Array.isArray(attachments)) {
    throw new Error(`Item ${item.id} has malformed dropzone attachments.`);
  }
  return attachments.map((attachment) => parseDropzoneAttachment(item, attachment));
}

function getItemDropzonePolicy(item: WorkspaceItem): DropzonePolicy {
  return {
    maxAttachments: getItemNullableNumber(item, "maxAttachments"),
    maxFileBytes: getItemNumber(item, "maxFileBytes"),
    maxTotalBytes: getItemNullableNumber(item, "maxTotalBytes"),
    allowedMimePrefixes: getItemStringArray(item, "allowedMimePrefixes"),
  };
}

let playgroundDropzoneAttachmentSequence = 0;

function createPlaygroundDropzoneAttachmentId(itemId: string): string {
  playgroundDropzoneAttachmentSequence += 1;
  return `${itemId}-attachment-${playgroundDropzoneAttachmentSequence}`;
}

function commitDropzoneData(
  context: ItemRowRenderContext,
  update: Record<string, WorkspaceSectionData>,
): void {
  setItemData(context.sectionId, context.item.id, {
    ...getItemDataRecord(context.item),
    ...update,
  });
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

function commitAcceptedDropzoneResult(
  context: ItemRowRenderContext,
  result: DropzoneAcceptedResult,
): void {
  const attachments = getItemDropzoneAttachments(context.item);
  commitDropzoneData(context, {
    attachments: [...attachments, ...resolveAcceptedDropzoneAttachments(context.item, result)],
    errorMessage: "",
  });
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

function PlaygroundDropzoneControl({ context }: { context: ItemRowRenderContext }) {
  const attachments = getItemDropzoneAttachments(context.item);
  const data = getItemDataRecord(context.item);
  const errorMessage = data["errorMessage"];
  if (typeof errorMessage !== "string") {
    throw new Error(`Item ${context.item.id} has a malformed errorMessage field.`);
  }
  const onServerFilePickerRequest = getItemBoolean(context.item, "serverPicker")
    ? () => {
        commitDropzoneData(context, {
          attachments: [
            ...attachments,
            {
              id: createPlaygroundDropzoneAttachmentId(context.item.id),
              kind: "file",
              name: "server-example.csv",
              size: 2048,
            },
          ],
          errorMessage: "",
        });
      }
    : undefined;
  return (
    <DropzoneValueControl
      ariaLabel={`${getItemLabel(context.item)} dropzone`}
      sectionId={context.sectionId}
      controlId={context.item.id}
      attachments={attachments}
      policy={getItemDropzonePolicy(context.item)}
      placeholder="Drop a file here"
      pending={getItemBoolean(context.item, "pending")}
      errorMessage={errorMessage || undefined}
      onAccepted={(result) => commitAcceptedDropzoneResult(context, result)}
      onRejected={(rejections) => {
        const firstRejection = rejections[0];
        if (firstRejection) {
          commitDropzoneData(context, {
            errorMessage: describeDropzoneRejection(firstRejection),
          });
        }
      }}
      onServerFilePickerRequest={onServerFilePickerRequest}
      onAttachmentRemove={(attachmentId) => {
        commitDropzoneData(context, {
          attachments: attachments.filter((attachment) => attachment.id !== attachmentId),
          errorMessage: "",
        });
      }}
    />
  );
}

function ItemValueControl({ context }: { context: ItemRowRenderContext }) {
  const control = getItemField(context.item, "control");
  const value = getItemValue(context.item);
  const ariaLabel = `${getItemLabel(context.item)} value`;
  const onValueChange = (nextValue: string) => commitItemValue(context, nextValue);
  const specializedControl = renderSpecializedItemValueControl(control, {
    context,
    value,
    ariaLabel,
    onValueChange,
  });
  if (specializedControl !== null) {
    return specializedControl;
  }
  if (control === "dropzone") {
    return <PlaygroundDropzoneControl context={context} />;
  }
  if (control === "password") {
    return (
      <PasswordValueControl
        ariaLabel={ariaLabel}
        sectionId={context.sectionId}
        itemId={context.item.id}
        value={value}
        onValueChange={onValueChange}
      />
    );
  }
  if (control === "dropdown") {
    return (
      <DropdownValueControl
        ariaLabel={ariaLabel}
        value={value}
        choices={getItemDropdownChoices(context.item)}
        onValueChange={onValueChange}
      />
    );
  }
  if (control === "color") {
    return (
      <ColorValueControl
        ariaLabel={ariaLabel}
        sectionId={context.sectionId}
        itemId={context.item.id}
        value={value}
        choices={getItemColorChoices(context.item)}
        onValueChange={onValueChange}
      />
    );
  }
  if (control === "multiline") {
    return (
      <TextValueEditor
        ariaLabel={ariaLabel}
        sectionId={context.sectionId}
        itemId={context.item.id}
        value={value}
        language={null}
        singleLine={false}
        wrapLines
        onValueChange={onValueChange}
      />
    );
  }
  if (control !== undefined) {
    throw new Error(`Item ${context.item.id} names the unknown control ${String(control)}.`);
  }
  return (
    <TextValueEditor
      ariaLabel={ariaLabel}
      sectionId={context.sectionId}
      itemId={context.item.id}
      value={value}
      language={ITEM_VALUE_LANGUAGE}
      onValueChange={onValueChange}
    />
  );
}

type SpecializedItemValueControlProps = {
  context: ItemRowRenderContext;
  value: string;
  ariaLabel: string;
  onValueChange: (nextValue: string) => void;
};

function renderSpecializedItemValueControl(
  control: string | boolean | undefined,
  props: SpecializedItemValueControlProps,
) {
  if (control === "switch") {
    return (
      <SwitchValueControl
        ariaLabel={props.ariaLabel}
        sectionId={props.context.sectionId}
        value={props.value}
        onValueChange={props.onValueChange}
      />
    );
  }
  if (control === "slider" || control === "rotary") {
    return <NumericItemValueControl {...props} control={control} />;
  }
  if (control === "date" || control === "time") {
    return <DateTimeItemValueControl {...props} control={control} />;
  }
  return null;
}

function NumericItemValueControl({
  context,
  control,
  value,
  ariaLabel,
  onValueChange,
}: SpecializedItemValueControlProps & { control: "slider" | "rotary" }) {
  const props = {
    ariaLabel,
    sectionId: context.sectionId,
    value,
    min: getItemNumber(context.item, "min"),
    max: getItemNumber(context.item, "max"),
    step: getItemNumber(context.item, "step"),
    onValueChange,
  };
  return control === "slider" ? (
    <SliderValueControl {...props} />
  ) : (
    <RotaryValueControl {...props} />
  );
}

function DateTimeItemValueControl({
  context,
  control,
  value,
  ariaLabel,
  onValueChange,
}: SpecializedItemValueControlProps & { control: "date" | "time" }) {
  if (control === "date") {
    return (
      <DateValueControl
        ariaLabel={ariaLabel}
        sectionId={context.sectionId}
        value={value}
        onValueChange={onValueChange}
        displayFormat={getItemOption(context.item, "displayFormat", ["iso", "us", "eu", "long"])}
        controlMode={getItemOption(context.item, "controlMode", ["input", "calendar"])}
        selectionMode={getItemOption(context.item, "selectionMode", ["single", "multiple"])}
        weekStart={getItemOption(context.item, "weekStart", ["sunday", "monday"])}
        includeTime={getItemBoolean(context.item, "includeTime")}
        timeDisplayFormat={getItemOption(context.item, "timeDisplayFormat", [
          "twenty_four_hour",
          "twelve_hour",
        ])}
      />
    );
  }
  return (
    <TimeValueControl
      ariaLabel={ariaLabel}
      sectionId={context.sectionId}
      value={value}
      onValueChange={onValueChange}
      controlMode={getItemOption(context.item, "controlMode", ["input", "display"])}
      displayFormat={getItemOption(context.item, "displayFormat", [
        "twenty_four_hour",
        "twelve_hour",
      ])}
      transparent={getItemBoolean(context.item, "transparent")}
      scale={getItemNumber(context.item, "scale")}
      font={getItemOption(context.item, "font", ["clock", "monospace", "system"])}
    />
  );
}

function ItemRowContent({ context }: { context: ItemRowRenderContext }) {
  const label = getItemLabel(context.item);
  const isGroup = isGroupItem(context.item);
  if (getItemField(context.item, "editableName") === true) {
    return (
      <>
        <EditableItemName context={context} hasChildren={isGroup} />
        {!isGroup && <ItemValueControl context={context} />}
      </>
    );
  }
  if (isGroup) {
    return (
      <WorkspaceItemLabel className={ITEM_LABEL_CLASS_NAME} isGroup>
        {label}
      </WorkspaceItemLabel>
    );
  }
  return (
    <>
      <WorkspaceItemLabel className={ITEM_LABEL_CLASS_NAME} isGroup={false}>
        {label}
      </WorkspaceItemLabel>
      <ItemValueControl context={context} />
    </>
  );
}

// Exported for the focused host-presentation regression; the application mounts it only
// through the registered section kind.
export function ItemListSectionBody({ section }: { section: WorkspaceSection }) {
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
        renderItem={(context) => <ItemRowContent context={context} />}
        isGroupItem={isGroupItem}
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
  registerSectionKinds({
    leaf: {
      renderContent: (section) => <LeafSectionBody section={section} />,
      contentClassName: "px-1",
      defaultSize: { width: 200, height: 122 },
    },
    "item-list": {
      renderContent: (section) => <ItemListSectionBody section={section} />,
      contentClassName: "flex min-h-0 flex-col",
      defaultSize: { width: 550, height: 350 },
    },
    "meta-control": {
      renderContent: (section) => <MetaControlSectionBody section={section} />,
      presentation: {
        type: "meta-control",
        resolveControlKind: getMetaControlKind,
        onEdit: (section) => commitPlaygroundMetaControlEditRequest(section.id),
      },
    },
  });
}
