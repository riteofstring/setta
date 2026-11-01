import {
  DATE_OPTIONS,
  TIME_OPTIONS,
  TIME_DISPLAY_FORMATS,
  TIME_DISPLAY_SCALE_MIN,
  TIME_DISPLAY_SCALE_MAX,
} from "../controls/date-time/dateTimeOptions.js";
import {
  assertRecord,
  assertKnownFields,
  assertString,
  assertStringOptions,
  type UnknownRecord,
} from "../validation.js";
import type {
  WorkspaceDropzoneAttachment,
  WorkspaceDropzonePolicy,
  WorkspaceItem,
  WorkspaceItemControlConfiguration,
  WorkspaceItemControlKind,
  WorkspaceItemControlPresentation,
  WorkspaceItemPresentation,
} from "./types.js";

type ConfigurableItemControlKind = Exclude<WorkspaceItemControlKind, "group">;
type ConfigurationValidator = (config: UnknownRecord, owner: string) => void;

const ITEM_CONTROL_KINDS = new Set([
  "group",
  "text",
  "code",
  "textarea",
  "switch",
  "dropdown",
  "color",
  "slider",
  "rotary",
  "password",
  "date",
  "time",
  "dropzone",
]);
const TEXT_LANGUAGES = new Set([
  "python",
  "typescript",
  "javascript",
  "json",
  "yaml",
  "toml",
  "markdown",
]);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function assertNullableString(
  value: unknown,
  owner: string,
): asserts value is string | null {
  if (value !== null) {
    assertString(value, owner);
  }
}

function assertBoolean(
  value: unknown,
  owner: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${owner} must be a boolean.`);
  }
}

function assertFiniteNumber(
  value: unknown,
  owner: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${owner} must be finite.`);
  }
}

function assertOption(
  value: unknown,
  owner: string,
  options: ReadonlyArray<string>,
): void {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new Error(`${owner} has unsupported value ${String(value)}.`);
  }
}

function assertBaseConfiguration(config: UnknownRecord, owner: string) {
  assertBoolean(config["disabled"], `${owner}.disabled`);
}

function assertTextConfiguration(
  config: UnknownRecord,
  owner: string,
  code: boolean,
) {
  const fields = [
    "autocomplete",
    "disabled",
    "placeholder",
    "singleLine",
    "wrapLines",
  ];
  assertKnownFields(config, owner, code ? [...fields, "language"] : fields);
  assertBaseConfiguration(config, owner);
  assertOption(config["autocomplete"], `${owner}.autocomplete`, ["off"]);
  assertNullableString(config["placeholder"], `${owner}.placeholder`);
  assertBoolean(config["singleLine"], `${owner}.singleLine`);
  assertBoolean(config["wrapLines"], `${owner}.wrapLines`);
  if (code) {
    assertOption(config["language"], `${owner}.language`, [...TEXT_LANGUAGES]);
  }
}

function assertTextAreaConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, [
    "autocomplete",
    "disabled",
    "language",
    "placeholder",
  ]);
  assertBaseConfiguration(config, owner);
  assertOption(config["autocomplete"], `${owner}.autocomplete`, ["off"]);
  if (config["language"] !== null) {
    assertOption(config["language"], `${owner}.language`, [...TEXT_LANGUAGES]);
  }
  assertNullableString(config["placeholder"], `${owner}.placeholder`);
}

function assertNumericConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, ["disabled", "max", "min", "step"]);
  assertBaseConfiguration(config, owner);
  assertFiniteNumber(config["min"], `${owner}.min`);
  assertFiniteNumber(config["max"], `${owner}.max`);
  assertFiniteNumber(config["step"], `${owner}.step`);
  if (config["min"] >= config["max"]) {
    throw new Error(`${owner}.min must be less than max.`);
  }
  if (config["step"] <= 0 || config["step"] > config["max"] - config["min"]) {
    throw new Error(
      `${owner}.step must be greater than zero and no larger than max minus min.`,
    );
  }
}

function assertDropdownChoices(value: unknown, owner: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${owner} must be an array.`);
  }
  const seenChoices = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (typeof entry === "string") {
      assertUniqueChoice(entry, `${owner}[${index}]`, seenChoices);
      continue;
    }
    assertRecord(entry, `${owner}[${index}]`);
    assertKnownFields(entry, `${owner}[${index}]`, ["choices", "group"]);
    assertString(entry["group"], `${owner}[${index}].group`);
    if (entry["group"].trim() === "") {
      throw new Error(`${owner}[${index}].group must not be blank.`);
    }
    if (!Array.isArray(entry["choices"])) {
      throw new Error(`${owner}[${index}].choices must be an array.`);
    }
    for (const [choiceIndex, choice] of entry["choices"].entries()) {
      assertString(choice, `${owner}[${index}].choices[${choiceIndex}]`);
      assertUniqueChoice(
        choice,
        `${owner}[${index}].choices[${choiceIndex}]`,
        seenChoices,
      );
    }
  }
  const hasStrings = value.some((entry) => typeof entry === "string");
  const hasGroups = value.some((entry) => typeof entry !== "string");
  if (hasStrings && hasGroups) {
    throw new Error(`${owner} cannot mix flat choices and choice groups.`);
  }
}

function assertUniqueChoice(
  choice: string,
  owner: string,
  seenChoices: Set<string>,
) {
  if (choice.trim() === "") {
    throw new Error(`${owner} must not be blank.`);
  }
  if (seenChoices.has(choice)) {
    throw new Error(`${owner} duplicates choice ${choice}.`);
  }
  seenChoices.add(choice);
}

function assertColorChoices(value: unknown, owner: string) {
  if (value === null) {
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${owner} must be null or a non-empty array.`);
  }
  const seenColors = new Set<string>();
  for (const [index, choice] of value.entries()) {
    assertRecord(choice, `${owner}[${index}]`);
    assertKnownFields(choice, `${owner}[${index}]`, ["color", "description"]);
    assertString(choice["color"], `${owner}[${index}].color`);
    assertString(choice["description"], `${owner}[${index}].description`);
    if (!HEX_COLOR_PATTERN.test(choice["color"])) {
      throw new Error(
        `${owner}[${index}].color must be a six-digit hex color.`,
      );
    }
    if (choice["description"].trim() === "") {
      throw new Error(`${owner}[${index}].description must not be blank.`);
    }
    if (seenColors.has(choice["color"])) {
      throw new Error(`${owner} duplicates color ${choice["color"]}.`);
    }
    seenColors.add(choice["color"]);
  }
}

function assertDateConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, [
    "controlMode",
    "disabled",
    "displayFormat",
    "includeTime",
    "selectionMode",
    "timeDisplayFormat",
    "weekStart",
  ]);
  assertBaseConfiguration(config, owner);
  assertStringOptions(
    config,
    DATE_OPTIONS,
    (field, value) =>
      `${owner}.${field} has unsupported value ${String(value)}.`,
  );
  assertBoolean(config["includeTime"], `${owner}.includeTime`);
  assertOption(
    config["timeDisplayFormat"],
    `${owner}.timeDisplayFormat`,
    TIME_DISPLAY_FORMATS,
  );
}

function assertTimeConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, [
    "controlMode",
    "disabled",
    "displayFormat",
    "font",
    "scale",
    "transparent",
  ]);
  assertBaseConfiguration(config, owner);
  assertStringOptions(
    config,
    TIME_OPTIONS,
    (field, value) =>
      `${owner}.${field} has unsupported value ${String(value)}.`,
  );
  assertBoolean(config["transparent"], `${owner}.transparent`);
  assertFiniteNumber(config["scale"], `${owner}.scale`);
  if (
    config["scale"] < TIME_DISPLAY_SCALE_MIN ||
    config["scale"] > TIME_DISPLAY_SCALE_MAX
  ) {
    throw new Error(`${owner}.scale must be between 0.5 and 3.`);
  }
}

function assertPositiveIntegerOrNull(
  value: unknown,
  owner: string,
): asserts value is number | null {
  if (
    value !== null &&
    (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error(`${owner} must be null or a positive safe integer.`);
  }
}

function assertDropzoneConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, [
    "attachments",
    "disabled",
    "errorMessage",
    "pending",
    "placeholder",
    "policy",
  ]);
  assertBaseConfiguration(config, owner);
  assertString(config["placeholder"], `${owner}.placeholder`);
  assertBoolean(config["pending"], `${owner}.pending`);
  assertNullableString(config["errorMessage"], `${owner}.errorMessage`);
  assertDropzonePolicy(config["policy"], `${owner}.policy`);
  assertDropzoneAttachments(config["attachments"], `${owner}.attachments`);
  if (
    config["policy"].maxAttachments !== null &&
    config["attachments"].length > config["policy"].maxAttachments
  ) {
    throw new Error(`${owner}.attachments exceeds policy.maxAttachments.`);
  }
}

function assertDropzonePolicy(
  value: unknown,
  owner: string,
): asserts value is WorkspaceDropzonePolicy {
  assertRecord(value, owner);
  assertKnownFields(value, owner, [
    "allowedMimePrefixes",
    "maxAttachments",
    "maxFileBytes",
    "maxTotalBytes",
  ]);
  assertPositiveIntegerOrNull(
    value["maxAttachments"],
    `${owner}.maxAttachments`,
  );
  if (
    typeof value["maxFileBytes"] !== "number" ||
    !Number.isSafeInteger(value["maxFileBytes"]) ||
    value["maxFileBytes"] <= 0
  ) {
    throw new Error(`${owner}.maxFileBytes must be a positive safe integer.`);
  }
  assertPositiveIntegerOrNull(value["maxTotalBytes"], `${owner}.maxTotalBytes`);
  if (!Array.isArray(value["allowedMimePrefixes"])) {
    throw new Error(`${owner}.allowedMimePrefixes must be an array.`);
  }
  for (const [index, prefix] of value["allowedMimePrefixes"].entries()) {
    assertString(prefix, `${owner}.allowedMimePrefixes[${index}]`);
    if (prefix.length === 0 || prefix.trim() !== prefix) {
      throw new Error(
        `${owner}.allowedMimePrefixes[${index}] must be nonblank and trimmed.`,
      );
    }
  }
}

function assertDropzoneAttachments(
  value: unknown,
  owner: string,
): asserts value is Array<WorkspaceDropzoneAttachment> {
  if (!Array.isArray(value)) {
    throw new Error(`${owner} must be an array.`);
  }
  const ids = new Set<string>();
  for (const [index, attachment] of value.entries()) {
    assertDropzoneAttachment(attachment, `${owner}[${index}]`, ids);
  }
}

function assertDropzoneAttachment(
  value: unknown,
  owner: string,
  ids: Set<string>,
) {
  assertRecord(value, owner);
  assertKnownFields(value, owner, ["id", "kind", "name", "size"]);
  assertString(value["id"], `${owner}.id`);
  assertString(value["name"], `${owner}.name`);
  assertOption(value["kind"], `${owner}.kind`, ["file", "text"]);
  if (value["id"].length === 0 || value["name"].length === 0) {
    throw new Error(`${owner} requires non-empty id and name fields.`);
  }
  if (ids.has(value["id"])) {
    throw new Error(`${owner} duplicates attachment id ${value["id"]}.`);
  }
  ids.add(value["id"]);
  const size = value["size"];
  if (
    size !== null &&
    (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)
  ) {
    throw new Error(
      `${owner}.size must be null or a non-negative safe integer.`,
    );
  }
}

function assertSwitchConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, ["disabled"]);
  assertBaseConfiguration(config, owner);
}

function assertDropdownConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, ["choices", "disabled", "placeholder"]);
  assertBaseConfiguration(config, owner);
  assertDropdownChoices(config["choices"], `${owner}.choices`);
  assertNullableString(config["placeholder"], `${owner}.placeholder`);
}

function assertColorConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, ["choices", "disabled"]);
  assertBaseConfiguration(config, owner);
  assertColorChoices(config["choices"], `${owner}.choices`);
}

function assertPasswordConfiguration(config: UnknownRecord, owner: string) {
  assertKnownFields(config, owner, [
    "disabled",
    "placeholder",
    "savedValuePending",
  ]);
  assertBaseConfiguration(config, owner);
  assertNullableString(config["placeholder"], `${owner}.placeholder`);
  assertBoolean(config["savedValuePending"], `${owner}.savedValuePending`);
}

const CONTROL_CONFIGURATION_VALIDATORS = {
  text: (config, owner) => assertTextConfiguration(config, owner, false),
  code: (config, owner) => assertTextConfiguration(config, owner, true),
  textarea: assertTextAreaConfiguration,
  switch: assertSwitchConfiguration,
  dropdown: assertDropdownConfiguration,
  color: assertColorConfiguration,
  slider: assertNumericConfiguration,
  rotary: assertNumericConfiguration,
  password: assertPasswordConfiguration,
  date: assertDateConfiguration,
  time: assertTimeConfiguration,
  dropzone: assertDropzoneConfiguration,
} satisfies Record<ConfigurableItemControlKind, ConfigurationValidator>;

function assertControlConfiguration(
  kind: string,
  config: UnknownRecord,
  owner: string,
) {
  const validator =
    CONTROL_CONFIGURATION_VALIDATORS[kind as ConfigurableItemControlKind];
  if (!validator) {
    throw new Error(
      `${owner} belongs to the unknown configurable kind ${kind}.`,
    );
  }
  validator(config, owner);
}

export function assertWorkspaceItemControlPresentation(
  control: unknown,
  owner: string,
): asserts control is WorkspaceItemControlPresentation {
  assertRecord(control, owner);
  const kind = control["kind"];
  if (typeof kind !== "string" || !ITEM_CONTROL_KINDS.has(kind)) {
    throw new Error(`${owner} names the unknown kind ${String(kind)}.`);
  }
  if (kind === "group") {
    assertKnownFields(control, owner, ["kind"]);
    return;
  }
  assertKnownFields(control, owner, ["configuration", "kind", "value"]);
  assertString(control["value"], `${owner}.value`);
  if (kind === "color" && !HEX_COLOR_PATTERN.test(control["value"])) {
    throw new Error(`${owner}.value must be a six-digit hex color.`);
  }
  assertRecord(control["configuration"], `${owner}.configuration`);
  assertControlConfiguration(
    kind,
    control["configuration"],
    `${owner}.configuration`,
  );
}

export function assertWorkspaceItemControlConfiguration(
  update: unknown,
  owner: string,
): asserts update is WorkspaceItemControlConfiguration {
  assertRecord(update, owner);
  assertKnownFields(update, owner, ["configuration", "kind"]);
  const kind = update["kind"];
  if (
    typeof kind !== "string" ||
    kind === "group" ||
    !ITEM_CONTROL_KINDS.has(kind)
  ) {
    throw new Error(
      `${owner} names the unknown configurable kind ${String(kind)}.`,
    );
  }
  assertRecord(update["configuration"], `${owner}.configuration`);
  assertControlConfiguration(
    kind,
    update["configuration"],
    `${owner}.configuration`,
  );
}

export function assertWorkspaceItemPresentation(
  presentation: unknown,
  owner: string,
): asserts presentation is WorkspaceItemPresentation {
  assertRecord(presentation, owner);
  assertKnownFields(presentation, owner, [
    "control",
    "helpText",
    "label",
    "labelEditable",
  ]);
  assertString(presentation["label"], `${owner}.label`);
  assertBoolean(presentation["labelEditable"], `${owner}.labelEditable`);
  if (Object.hasOwn(presentation, "helpText")) {
    assertString(presentation["helpText"], `${owner}.helpText`);
  }
  assertWorkspaceItemControlPresentation(
    presentation["control"],
    `${owner}.control`,
  );
}

export function assertWorkspaceItemPresentationBoundary(
  sectionId: string,
  item: WorkspaceItem,
  rootId: string,
): void {
  const owner = `Section ${sectionId} item ${item.id}`;
  if (item.id === rootId) {
    if (item.presentation !== undefined || item.data !== undefined) {
      throw new Error(
        `${owner} is the structural root and cannot contain row content.`,
      );
    }
    return;
  }
  if (item.presentation === undefined) {
    return;
  }
  if (item.data !== undefined) {
    throw new Error(
      `${owner} cannot contain both a built-in presentation and opaque data.`,
    );
  }
  assertWorkspaceItemPresentation(item.presentation, `${owner} presentation`);
}

export function hasWorkspaceItemPresentation(
  item: WorkspaceItem,
): item is WorkspaceItem & { presentation: WorkspaceItemPresentation } {
  return item.presentation !== undefined;
}
