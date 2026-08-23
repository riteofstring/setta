import {
  DIAGNOSTIC_SEVERITY_ERROR_V2,
  DIAGNOSTIC_SEVERITY_INFORMATION_V2,
  DIAGNOSTIC_SEVERITY_WARNING_V2,
  DICTIONARY_ENTRY_KIND_LEAF_V2,
  DICTIONARY_ENTRY_KIND_PARENT_V2,
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2,
  PROJECT_SNAPSHOT_VERSION_V2,
  PROVIDER_AVAILABILITY_AVAILABLE_V2,
  PROVIDER_AVAILABILITY_UNAVAILABLE_V2,
  PROVIDER_BASEDPYRIGHT_V2,
  PROVIDER_LIFECYCLE_STATE_FAILED_V2,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2,
  PROVIDER_LIFECYCLE_STATE_PENDING_V2,
  PROVIDER_LIFECYCLE_STATE_READY_V2,
  type APIErrorCodeV2,
  type APIErrorV2,
  type ByteRangeV2,
  type CallableV2,
  type CompletionItemV2,
  type CompletionResponseV2,
  type DiagnosticSeverityV2,
  type DiagnosticV2,
  type DictionaryEntryV2,
  type ErrorResponseV2,
  type GeneratedCodeV2,
  type ListV2,
  type ParameterPassingStyleV2,
  type ParameterDictionaryV2,
  type ParameterUIV2,
  type ParameterV2,
  type ProjectSnapshotV2,
  type ProjectV2,
  type ProviderAvailabilityV2,
  type ProviderLifecycleStateV2,
  type ProviderStatusV2,
  type PythonTargetV2,
} from "./generatedContract";
import { isUtf8Boundary, sliceByByteRange, utf8ByteLength } from "./utf8";

export class ProjectSnapshotValidationError extends Error {
  public constructor(
    public readonly field: string,
    problem: string,
  ) {
    super(`Invalid ProjectSnapshotV2 ${field}: ${problem}.`);
    this.name = "ProjectSnapshotValidationError";
  }
}

export function parseProjectSnapshotV2(value: unknown): ProjectSnapshotV2 {
  const record = readClosedRecord(value, "snapshot", [
    "version",
    "project",
    "pythonTarget",
    "callables",
    "parameterDictionaries",
    "lists",
    "topLevelSectionIds",
    "generatedCode",
    "diagnostics",
    "diagnosticsRevision",
    "providerStatus",
  ]);
  const version = readString(record.version, "version");
  if (version !== PROJECT_SNAPSHOT_VERSION_V2) {
    fail("version", "is not supported");
  }

  const project = parseProject(record.project);
  const pythonTarget = parsePythonTarget(record.pythonTarget);
  const targetIds = new Set<string>();
  const sectionIds = new Set<string>();
  const callables = parseCallables(record.callables, targetIds, sectionIds);
  const parameterDictionaries = parseParameterDictionaries(
    record.parameterDictionaries,
    targetIds,
    sectionIds,
  );
  const lists = parseLists(record.lists, targetIds, sectionIds);
  if (targetIds.has(project.id)) {
    fail("project.id", "must be globally unique");
  }
  const topLevelSectionIds = parseSectionForest(
    record.topLevelSectionIds,
    lists,
    sectionIds,
  );
  const generatedCode = parseGeneratedCode(
    record.generatedCode,
    pythonTarget,
    targetIds,
  );
  const diagnostics = parseDiagnostics(
    record.diagnostics,
    generatedCode.code,
    targetIds,
  );
  const diagnosticsRevision = readNonNegativeInteger(
    record.diagnosticsRevision,
    "diagnosticsRevision",
  );
  if (diagnosticsRevision > project.revision) {
    fail("diagnosticsRevision", "must not exceed project.revision");
  }
  if (diagnosticsRevision < project.revision && diagnostics.length !== 0) {
    fail(
      "diagnostics",
      "must be empty while diagnosticsRevision trails project.revision",
    );
  }

  return {
    version: PROJECT_SNAPSHOT_VERSION_V2,
    project,
    pythonTarget,
    callables,
    parameterDictionaries,
    lists,
    topLevelSectionIds,
    generatedCode,
    diagnostics,
    diagnosticsRevision,
    providerStatus: parseProviderStatus(record.providerStatus),
  };
}

export function parseErrorResponseV2(value: unknown): ErrorResponseV2 {
  const response = readClosedRecord(value, "error response", ["error"]);
  const errorRecord = readPlainRecord(response.error, "error response.error");
  const code = parseApiErrorCode(errorRecord.code);
  const message = readNonBlankString(
    errorRecord.message,
    "error response.error.message",
  );

  if (code === "revision_conflict") {
    requireExactEnumerableKeys(
      errorRecord,
      ["code", "message", "expectedRevision", "currentRevision"],
      "error response.error",
    );
    return {
      error: {
        code,
        currentRevision: readPositiveInteger(
          errorRecord.currentRevision,
          "error response.error.currentRevision",
        ),
        expectedRevision: readPositiveInteger(
          errorRecord.expectedRevision,
          "error response.error.expectedRevision",
        ),
        message,
      },
    };
  }

  requireExactEnumerableKeys(
    errorRecord,
    ["code", "message"],
    "error response.error",
  );
  const error: APIErrorV2 = { code, message };
  return { error };
}

export function parseCompletionResponseV2(
  value: unknown,
): CompletionResponseV2 {
  const response = readClosedRecord(value, "completion response", ["items"]);
  return {
    items: readArray(
      response.items,
      "completion response.items",
      parseCompletionItem,
    ),
  };
}

function parseProject(value: unknown): ProjectV2 {
  const record = readClosedRecord(value, "project", ["id", "name", "revision"]);
  const id = readString(record.id, "project.id");
  requireStableId("project.id", id);
  const name = readNonBlankString(record.name, "project.name");
  if (name !== name.trim()) {
    fail("project.name", "must not include surrounding whitespace");
  }
  return {
    id,
    name,
    revision: readPositiveInteger(record.revision, "project.revision"),
  };
}

function parsePythonTarget(value: unknown): PythonTargetV2 {
  const record = readClosedRecord(value, "pythonTarget", ["prefix", "suffix"]);
  return {
    prefix: readText(record.prefix, "pythonTarget.prefix", true),
    suffix: readText(record.suffix, "pythonTarget.suffix", true),
  };
}

function parseCallables(
  value: unknown,
  targetIds: Set<string>,
  sectionIds: Set<string>,
): CallableV2[] {
  return readArray(value, "callables", (entry, index) => {
    const field = `callables[${String(index)}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "name",
      "authoredExpression",
      "parameters",
    ]);
    const id = readString(record.id, `${field}.id`);
    claimTargetId(targetIds, id, `${field}.id`);
    claimSectionId(sectionIds, id, `${field}.id`);
    const name = readNonBlankString(record.name, `${field}.name`);
    if (name !== name.trim()) {
      fail(`${field}.name`, "must not include surrounding whitespace");
    }
    return {
      id,
      name,
      authoredExpression: readText(
        record.authoredExpression,
        `${field}.authoredExpression`,
        true,
      ),
      parameters: parseParameters(record.parameters, field, targetIds),
    };
  });
}

function parseParameterDictionaries(
  value: unknown,
  targetIds: Set<string>,
  sectionIds: Set<string>,
): ParameterDictionaryV2[] {
  return readArray(value, "parameterDictionaries", (entry, index) => {
    const field = `parameterDictionaries[${String(index)}]`;
    const record = readClosedRecord(entry, field, ["id", "name", "entries"]);
    const id = readString(record.id, `${field}.id`);
    claimTargetId(targetIds, id, `${field}.id`);
    claimSectionId(sectionIds, id, `${field}.id`);
    const name = readNonBlankString(record.name, `${field}.name`);
    if (name !== name.trim()) {
      fail(`${field}.name`, "must not include surrounding whitespace");
    }
    return {
      id,
      name,
      entries: parseDictionaryEntries(
        record.entries,
        `${field}.entries`,
        targetIds,
      ),
    };
  });
}

function parseDictionaryEntries(
  value: unknown,
  field: string,
  targetIds: Set<string>,
): DictionaryEntryV2[] {
  const siblingNames = new Set<string>();
  return readArray(value, field, (entry, index) => {
    const entryField = `${field}[${String(index)}]`;
    const raw = readPlainRecord(entry, entryField);
    const kind = readString(raw.kind, `${entryField}.kind`);
    if (kind === DICTIONARY_ENTRY_KIND_LEAF_V2) {
      const record = readClosedRecord(entry, entryField, [
        "kind",
        "id",
        "name",
        "ui",
        "authoredExpression",
      ]);
      const id = readString(record.id, `${entryField}.id`);
      claimTargetId(targetIds, id, `${entryField}.id`);
      const name = readDictionaryEntryName(
        record.name,
        entryField,
        siblingNames,
      );
      return {
        kind: DICTIONARY_ENTRY_KIND_LEAF_V2,
        id,
        name,
        ui: parseConfigurableParameterUI(record.ui, `${entryField}.ui`),
        authoredExpression: readText(
          record.authoredExpression,
          `${entryField}.authoredExpression`,
          true,
        ),
      };
    }
    if (kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
      const record = readClosedRecord(entry, entryField, [
        "kind",
        "id",
        "name",
        "ui",
        "children",
      ]);
      const id = readString(record.id, `${entryField}.id`);
      claimTargetId(targetIds, id, `${entryField}.id`);
      const name = readDictionaryEntryName(
        record.name,
        entryField,
        siblingNames,
      );
      return {
        kind: DICTIONARY_ENTRY_KIND_PARENT_V2,
        id,
        name,
        ui: parseNestedParameterUI(record.ui, `${entryField}.ui`),
        children: parseDictionaryEntries(
          record.children,
          `${entryField}.children`,
          targetIds,
        ),
      };
    }
    fail(`${entryField}.kind`, "is not supported");
  });
}

function readDictionaryEntryName(
  value: unknown,
  field: string,
  siblingNames: Set<string>,
): string {
  const name = readNonBlankString(value, `${field}.name`);
  if (name !== name.trim()) {
    fail(`${field}.name`, "must not include surrounding whitespace");
  }
  if (siblingNames.has(name)) {
    fail(`${field}.name`, "must be unique within its dictionary parent");
  }
  siblingNames.add(name);
  return name;
}

function parseLists(
  value: unknown,
  targetIds: Set<string>,
  sectionIds: Set<string>,
): ListV2[] {
  return readArray(value, "lists", (entry, index) => {
    const field = `lists[${String(index)}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "name",
      "childSectionIds",
    ]);
    const id = readString(record.id, `${field}.id`);
    claimTargetId(targetIds, id, `${field}.id`);
    claimSectionId(sectionIds, id, `${field}.id`);
    const name = readNonBlankString(record.name, `${field}.name`);
    if (name !== name.trim()) {
      fail(`${field}.name`, "must not include surrounding whitespace");
    }
    return {
      id,
      name,
      childSectionIds: readArray(
        record.childSectionIds,
        `${field}.childSectionIds`,
        (child, childIndex) =>
          readSectionId(
            child,
            `${field}.childSectionIds[${String(childIndex)}]`,
          ),
      ),
    };
  });
}

function parseSectionForest(
  value: unknown,
  lists: readonly ListV2[],
  sectionIds: ReadonlySet<string>,
): string[] {
  const topLevelSectionIds = readArray(
    value,
    "topLevelSectionIds",
    (entry, index) =>
      readSectionId(entry, `topLevelSectionIds[${String(index)}]`),
  );
  const placements = new Set<string>();
  const claimPlacement = (id: string, field: string): void => {
    if (!sectionIds.has(id)) {
      fail(field, "references an unknown section");
    }
    if (placements.has(id)) {
      fail(field, "gives a section multiple parents");
    }
    placements.add(id);
  };
  topLevelSectionIds.forEach((id, index) => {
    claimPlacement(id, `topLevelSectionIds[${String(index)}]`);
  });

  const childrenByList = new Map<string, readonly string[]>();
  for (const list of lists) {
    childrenByList.set(list.id, list.childSectionIds);
    list.childSectionIds.forEach((id, index) => {
      claimPlacement(id, `lists.${list.id}.childSectionIds[${String(index)}]`);
    });
  }
  if (placements.size !== sectionIds.size) {
    fail("topLevelSectionIds", "must place every section exactly once");
  }

  const colors = new Map<string, "visiting" | "visited">();
  const visitList = (listId: string): void => {
    const color = colors.get(listId);
    if (color === "visiting") {
      fail("lists", "contains a section cycle");
    }
    if (color === "visited") {
      return;
    }
    colors.set(listId, "visiting");
    for (const childId of childrenByList.get(listId) ?? []) {
      if (childrenByList.has(childId)) {
        visitList(childId);
      }
    }
    colors.set(listId, "visited");
  };
  for (const listId of childrenByList.keys()) {
    visitList(listId);
  }

  const reachable = new Set<string>();
  const visit = (sectionId: string): void => {
    if (reachable.has(sectionId)) {
      return;
    }
    reachable.add(sectionId);
    for (const childId of childrenByList.get(sectionId) ?? []) {
      visit(childId);
    }
  };
  topLevelSectionIds.forEach(visit);
  if (reachable.size !== sectionIds.size) {
    fail("topLevelSectionIds", "must reach every section");
  }
  return topLevelSectionIds;
}

function parseParameters(
  value: unknown,
  callableField: string,
  targetIds: Set<string>,
): ParameterV2[] {
  const context: ParameterParseContext = {
    callableField,
    names: new Set<string>(),
    providerOrdinals: new Set<number>(),
    targetIds,
  };
  return readArray(value, `${callableField}.parameters`, (entry, index) =>
    parseParameter(entry, index, context),
  );
}

type ParameterParseContext = {
  callableField: string;
  names: Set<string>;
  providerOrdinals: Set<number>;
  targetIds: Set<string>;
};

type ParsedParameterMetadata = Pick<
  ParameterV2,
  | "default"
  | "nameEditable"
  | "passingStyle"
  | "providerOrdinal"
  | "typeAnnotation"
>;

function parseParameter(
  entry: unknown,
  index: number,
  context: ParameterParseContext,
): ParameterV2 {
  const field = `${context.callableField}.parameters[${String(index)}]`;
  const record = readClosedRecord(entry, field, [
    "id",
    "name",
    "nameEditable",
    "passingStyle",
    "typeAnnotation",
    "default",
    "providerOrdinal",
    "authoredExpression",
    "ui",
  ]);
  const id = readString(record.id, `${field}.id`);
  claimTargetId(context.targetIds, id, `${field}.id`);
  const name = readText(record.name, `${field}.name`, true);
  claimParameterName(context.names, name, field);
  const metadata = parseParameterMetadata(record, field);
  validateParameterMetadata(field, name, metadata, context.providerOrdinals);
  return {
    id,
    name,
    ...metadata,
    authoredExpression: readText(
      record.authoredExpression,
      `${field}.authoredExpression`,
      true,
    ),
    ui: parseConfigurableParameterUI(record.ui, `${field}.ui`),
  };
}

function parseConfigurableParameterUI(
  value: unknown,
  field: string,
): Exclude<ParameterUIV2, { type: "NestedParam" }> {
  const ui = parseParameterUI(value, field);
  if (ui.type === "NestedParam") {
    fail(`${field}.type`, "is only valid for a dictionary parent");
  }
  return ui;
}

function parseNestedParameterUI(
  value: unknown,
  field: string,
): Extract<ParameterUIV2, { type: "NestedParam" }> {
  const ui = parseParameterUI(value, field);
  if (ui.type !== "NestedParam") {
    fail(`${field}.type`, "must be NestedParam for a dictionary parent");
  }
  return ui;
}

function parseParameterUI(value: unknown, field: string): ParameterUIV2 {
  const record = readClosedRecord(value, field, ["type", "configuration"]);
  const type = readString(record.type, `${field}.type`);
  const configurationField = `${field}.configuration`;
  switch (type) {
    case "CodeParam": {
      const configuration = parseTextParameterUIConfiguration(
        record.configuration,
        configurationField,
        true,
      );
      return {
        type,
        configuration: {
          ...configuration,
          language: readTextLanguage(
            readClosedRecord(record.configuration, configurationField, [
              "disabled",
              "language",
              "placeholder",
              "singleLine",
              "wrapLines",
            ]).language,
            `${configurationField}.language`,
          ),
        },
      };
    }
    case "TextParam":
      return {
        type,
        configuration: parseTextParameterUIConfiguration(
          record.configuration,
          configurationField,
          false,
        ),
      };
    case "TextAreaParam": {
      const configuration = readClosedRecord(
        record.configuration,
        configurationField,
        ["disabled", "language", "placeholder"],
      );
      return {
        type,
        configuration: {
          disabled: readBoolean(
            configuration.disabled,
            `${configurationField}.disabled`,
          ),
          language:
            configuration.language === null
              ? null
              : readTextLanguage(
                  configuration.language,
                  `${configurationField}.language`,
                ),
          placeholder: readTextOrNull(
            configuration.placeholder,
            `${configurationField}.placeholder`,
          ),
        },
      };
    }
    case "SwitchParam": {
      const configuration = readClosedRecord(
        record.configuration,
        configurationField,
        ["disabled"],
      );
      return {
        type,
        configuration: {
          disabled: readBoolean(
            configuration.disabled,
            `${configurationField}.disabled`,
          ),
        },
      };
    }
    case "DropdownParam":
      return {
        type,
        configuration: parseDropdownParameterUIConfiguration(
          record.configuration,
          configurationField,
        ),
      };
    case "ColorPickerParam":
      return {
        type,
        configuration: parseColorParameterUIConfiguration(
          record.configuration,
          configurationField,
        ),
      };
    case "SliderParam":
    case "RotaryParam":
      return {
        type,
        configuration: parseNumericParameterUIConfiguration(
          record.configuration,
          configurationField,
        ),
      };
    case "PasswordParam": {
      const configuration = readClosedRecord(
        record.configuration,
        configurationField,
        ["disabled", "placeholder"],
      );
      return {
        type,
        configuration: {
          disabled: readBoolean(
            configuration.disabled,
            `${configurationField}.disabled`,
          ),
          placeholder: readTextOrNull(
            configuration.placeholder,
            `${configurationField}.placeholder`,
          ),
        },
      };
    }
    case "DateParam":
      return {
        type,
        configuration: parseDateParameterUIConfiguration(
          record.configuration,
          configurationField,
        ),
      };
    case "TimeParam":
      return {
        type,
        configuration: parseTimeParameterUIConfiguration(
          record.configuration,
          configurationField,
        ),
      };
    case "DropzoneParam":
      return {
        type,
        configuration: parseDropzoneParameterUIConfiguration(
          record.configuration,
          configurationField,
        ),
      };
    case "NestedParam":
      readClosedRecord(record.configuration, configurationField, []);
      return { type, configuration: {} };
    default:
      fail(`${field}.type`, "is not supported");
  }
}

function parseTextParameterUIConfiguration(
  value: unknown,
  field: string,
  includesLanguage: boolean,
) {
  const keys = ["disabled", "placeholder", "singleLine", "wrapLines"];
  if (includesLanguage) {
    keys.splice(1, 0, "language");
  }
  const record = readClosedRecord(value, field, keys);
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    placeholder: readTextOrNull(record.placeholder, `${field}.placeholder`),
    singleLine: readBoolean(record.singleLine, `${field}.singleLine`),
    wrapLines: readBoolean(record.wrapLines, `${field}.wrapLines`),
  };
}

function parseDropdownParameterUIConfiguration(
  value: unknown,
  field: string,
) {
  const record = readClosedRecord(value, field, [
    "disabled",
    "placeholder",
    "flatChoices",
    "groupedChoices",
  ]);
  const flatChoices =
    record.flatChoices === null
      ? null
      : readArray(record.flatChoices, `${field}.flatChoices`, (choice, index) =>
          readNonBlankString(
            choice,
            `${field}.flatChoices[${String(index)}]`,
          ),
        );
  const groupedChoices =
    record.groupedChoices === null
      ? null
      : readArray(
          record.groupedChoices,
          `${field}.groupedChoices`,
          (group, index) => {
            const groupField = `${field}.groupedChoices[${String(index)}]`;
            const groupRecord = readClosedRecord(group, groupField, [
              "group",
              "choices",
            ]);
            return {
              group: readNonBlankString(
                groupRecord.group,
                `${groupField}.group`,
              ),
              choices: readArray(
                groupRecord.choices,
                `${groupField}.choices`,
                (choice, choiceIndex) =>
                  readNonBlankString(
                    choice,
                    `${groupField}.choices[${String(choiceIndex)}]`,
                  ),
              ),
            };
          },
        );
  if ((flatChoices === null) === (groupedChoices === null)) {
    fail(field, "must contain exactly one choice-set variant");
  }
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    placeholder: readTextOrNull(record.placeholder, `${field}.placeholder`),
    flatChoices,
    groupedChoices,
  };
}

function parseColorParameterUIConfiguration(value: unknown, field: string) {
  const record = readClosedRecord(value, field, ["disabled", "choices"]);
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    choices:
      record.choices === null
        ? null
        : readArray(record.choices, `${field}.choices`, (choice, index) => {
            const choiceField = `${field}.choices[${String(index)}]`;
            const choiceRecord = readClosedRecord(choice, choiceField, [
              "color",
              "description",
            ]);
            const color = readString(choiceRecord.color, `${choiceField}.color`);
            if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
              fail(`${choiceField}.color`, "must be a six-digit hex color");
            }
            return {
              color,
              description: readText(
                choiceRecord.description,
                `${choiceField}.description`,
                true,
              ),
            };
          }),
  };
}

function parseNumericParameterUIConfiguration(value: unknown, field: string) {
  const record = readClosedRecord(value, field, [
    "disabled",
    "min",
    "max",
    "step",
  ]);
  const min = readFiniteNumber(record.min, `${field}.min`);
  const max = readFiniteNumber(record.max, `${field}.max`);
  const step = readFiniteNumber(record.step, `${field}.step`);
  if (min >= max || step <= 0 || step > max - min) {
    fail(field, "has invalid numeric bounds");
  }
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    min,
    max,
    step,
  };
}

function parseDateParameterUIConfiguration(value: unknown, field: string) {
  const record = readClosedRecord(value, field, [
    "disabled",
    "displayFormat",
    "controlMode",
    "selectionMode",
    "weekStart",
    "includeTime",
    "timeDisplayFormat",
  ]);
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    displayFormat: readOption(record.displayFormat, `${field}.displayFormat`, [
      "iso",
      "us",
      "eu",
      "long",
    ] as const),
    controlMode: readOption(record.controlMode, `${field}.controlMode`, [
      "input",
      "calendar",
    ] as const),
    selectionMode: readOption(
      record.selectionMode,
      `${field}.selectionMode`,
      ["single", "multiple"] as const,
    ),
    weekStart: readOption(record.weekStart, `${field}.weekStart`, [
      "sunday",
      "monday",
    ] as const),
    includeTime: readBoolean(record.includeTime, `${field}.includeTime`),
    timeDisplayFormat: readOption(
      record.timeDisplayFormat,
      `${field}.timeDisplayFormat`,
      ["twenty_four_hour", "twelve_hour"] as const,
    ),
  };
}

function parseTimeParameterUIConfiguration(value: unknown, field: string) {
  const record = readClosedRecord(value, field, [
    "disabled",
    "controlMode",
    "displayFormat",
    "transparent",
    "scale",
    "font",
  ]);
  const scale = readFiniteNumber(record.scale, `${field}.scale`);
  if (scale < 0.5 || scale > 3) {
    fail(`${field}.scale`, "must be between 0.5 and 3");
  }
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    controlMode: readOption(record.controlMode, `${field}.controlMode`, [
      "input",
      "display",
    ] as const),
    displayFormat: readOption(
      record.displayFormat,
      `${field}.displayFormat`,
      ["twenty_four_hour", "twelve_hour"] as const,
    ),
    transparent: readBoolean(record.transparent, `${field}.transparent`),
    scale,
    font: readOption(record.font, `${field}.font`, [
      "clock",
      "monospace",
      "system",
    ] as const),
  };
}

function parseDropzoneParameterUIConfiguration(value: unknown, field: string) {
  const record = readClosedRecord(value, field, [
    "disabled",
    "placeholder",
    "policy",
  ]);
  const policyField = `${field}.policy`;
  const policy = readClosedRecord(record.policy, policyField, [
    "maxAttachments",
    "maxFileBytes",
    "maxTotalBytes",
    "allowedMimePrefixes",
  ]);
  const maxAttachments = readPositiveIntegerOrNull(
    policy.maxAttachments,
    `${policyField}.maxAttachments`,
  );
  const maxFileBytes = readPositiveInteger(
    policy.maxFileBytes,
    `${policyField}.maxFileBytes`,
  );
  const maxTotalBytes = readPositiveIntegerOrNull(
    policy.maxTotalBytes,
    `${policyField}.maxTotalBytes`,
  );
  return {
    disabled: readBoolean(record.disabled, `${field}.disabled`),
    placeholder: readText(record.placeholder, `${field}.placeholder`, true),
    policy: {
      maxAttachments,
      maxFileBytes,
      maxTotalBytes,
      allowedMimePrefixes: readArray(
        policy.allowedMimePrefixes,
        `${policyField}.allowedMimePrefixes`,
        (prefix, index) =>
          readNonBlankString(
            prefix,
            `${policyField}.allowedMimePrefixes[${String(index)}]`,
          ),
      ),
    },
  };
}

function readTextLanguage(
  value: unknown,
  field: string,
): "python" | "typescript" | "javascript" | "json" | "yaml" | "toml" | "markdown" {
  return readOption(value, field, [
    "python",
    "typescript",
    "javascript",
    "json",
    "yaml",
    "toml",
    "markdown",
  ] as const);
}

function claimParameterName(
  names: Set<string>,
  name: string,
  field: string,
): void {
  if (name !== name.trim()) {
    fail(`${field}.name`, "must not include surrounding whitespace");
  }
  if (name === "") {
    return;
  }
  if (names.has(name)) {
    fail(`${field}.name`, "must be unique within its callable");
  }
  names.add(name);
}

function parseParameterMetadata(
  record: Record<string, unknown>,
  field: string,
): ParsedParameterMetadata {
  return {
    default: readTextOrNull(record.default, `${field}.default`),
    nameEditable: readBoolean(record.nameEditable, `${field}.nameEditable`),
    passingStyle: parsePassingStyle(
      record.passingStyle,
      `${field}.passingStyle`,
    ),
    providerOrdinal: readNonNegativeIntegerOrNull(
      record.providerOrdinal,
      `${field}.providerOrdinal`,
    ),
    typeAnnotation: readTextOrNull(
      record.typeAnnotation,
      `${field}.typeAnnotation`,
    ),
  };
}

function validateParameterMetadata(
  field: string,
  name: string,
  metadata: ParsedParameterMetadata,
  providerOrdinals: Set<number>,
): void {
  const isCoherentAppAuthoredMetadata = [
    metadata.passingStyle === PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
    metadata.typeAnnotation === null,
    metadata.default === null,
    metadata.providerOrdinal === null,
  ].every(Boolean);
  const isCoherentProviderMetadata = [
    name !== "",
    metadata.providerOrdinal !== null,
  ].every(Boolean);
  if (metadata.nameEditable) {
    if (!isCoherentAppAuthoredMetadata) {
      fail(field, "has incoherent app-authored metadata");
    }
    return;
  }
  if (!isCoherentProviderMetadata) {
    fail(field, "has incoherent provider-derived metadata");
  }
  claimProviderOrdinal(providerOrdinals, metadata.providerOrdinal, field);
}

function claimProviderOrdinal(
  providerOrdinals: Set<number>,
  providerOrdinal: number | null,
  field: string,
): void {
  if (providerOrdinal === null) {
    return;
  }
  if (providerOrdinals.has(providerOrdinal)) {
    fail(`${field}.providerOrdinal`, "must be unique within its callable");
  }
  providerOrdinals.add(providerOrdinal);
}

function parseGeneratedCode(
  value: unknown,
  target: PythonTargetV2,
  targetIds: ReadonlySet<string>,
): GeneratedCodeV2 {
  const record = readClosedRecord(value, "generatedCode", [
    "code",
    "body",
    "generatedBodyRange",
    "sourceRangesByTargetId",
  ]);
  const code = readNonBlankString(record.code, "generatedCode.code");
  const body = readNonBlankString(record.body, "generatedCode.body");
  const generatedBodyRange = parseByteRange(
    record.generatedBodyRange,
    "generatedCode.generatedBodyRange",
    code,
  );
  const sourceRangesByTargetId = parseSourceRanges(
    record.sourceRangesByTargetId,
    code,
    targetIds,
  );
  const expectedCode = `${target.prefix}\n\n${body}\n\n${target.suffix}`;
  if (code !== expectedCode) {
    fail(
      "generatedCode.code",
      "does not compose the target and generated body",
    );
  }
  const expectedStart = utf8ByteLength(target.prefix) + 2;
  const expectedEnd = expectedStart + utf8ByteLength(body);
  if (
    generatedBodyRange.start !== expectedStart ||
    generatedBodyRange.end !== expectedEnd ||
    sliceByByteRange(code, generatedBodyRange) !== body
  ) {
    fail(
      "generatedCode.generatedBodyRange",
      "does not match the generated body",
    );
  }
  return { code, body, generatedBodyRange, sourceRangesByTargetId };
}

function parseSourceRanges(
  value: unknown,
  code: string,
  targetIds: ReadonlySet<string>,
): Record<string, ByteRangeV2> {
  const record = readPlainRecord(value, "generatedCode.sourceRangesByTargetId");
  const result: Record<string, ByteRangeV2> = {};
  for (const [targetId, range] of Object.entries(record)) {
    requireStableId("generatedCode.sourceRangesByTargetId key", targetId);
    if (!targetIds.has(targetId)) {
      fail(
        "generatedCode.sourceRangesByTargetId",
        "references an unknown target",
      );
    }
    result[targetId] = parseByteRange(
      range,
      `generatedCode.sourceRangesByTargetId.${targetId}`,
      code,
    );
  }
  return result;
}

function parseDiagnostics(
  value: unknown,
  code: string,
  targetIds: ReadonlySet<string>,
): DiagnosticV2[] {
  const ids = new Set<string>();
  return readArray(value, "diagnostics", (entry, index) => {
    const field = `diagnostics[${String(index)}]`;
    const record = readClosedRecord(entry, field, [
      "id",
      "severity",
      "message",
      "start",
      "end",
      "targetId",
    ]);
    const id = readString(record.id, `${field}.id`);
    requireStableId(`${field}.id`, id);
    if (ids.has(id)) {
      fail(`${field}.id`, "must be unique");
    }
    ids.add(id);
    const byteRange = parseByteRange(
      { start: record.start, end: record.end },
      field,
      code,
    );
    const targetId = readStableIdOrNull(record.targetId, `${field}.targetId`);
    if (targetId !== null && !targetIds.has(targetId)) {
      fail(`${field}.targetId`, "references an unknown target");
    }
    return {
      id,
      severity: parseDiagnosticSeverity(record.severity, `${field}.severity`),
      message: readNonBlankString(record.message, `${field}.message`),
      start: byteRange.start,
      end: byteRange.end,
      targetId,
    };
  });
}

function parseProviderStatus(value: unknown): ProviderStatusV2 {
  const record = readClosedRecord(value, "providerStatus", [
    "provider",
    "status",
    "state",
  ]);
  if (record.provider !== PROVIDER_BASEDPYRIGHT_V2) {
    fail("providerStatus.provider", "is not supported");
  }
  const status = parseProviderAvailability(record.status);
  const state = parseProviderLifecycleState(record.state);
  const unavailable =
    state === PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2 ||
    state === PROVIDER_LIFECYCLE_STATE_FAILED_V2;
  if (
    (unavailable && status !== PROVIDER_AVAILABILITY_UNAVAILABLE_V2) ||
    (!unavailable && status !== PROVIDER_AVAILABILITY_AVAILABLE_V2)
  ) {
    fail("providerStatus", "has an invalid availability/lifecycle combination");
  }
  return { provider: PROVIDER_BASEDPYRIGHT_V2, status, state };
}

function parseCompletionItem(value: unknown, index: number): CompletionItemV2 {
  const field = `completion response.items[${String(index)}]`;
  const record = readClosedRecord(value, field, ["label", "insertText"]);
  return {
    label: readNonBlankString(record.label, `${field}.label`),
    insertText: readNonBlankString(record.insertText, `${field}.insertText`),
  };
}

function parseByteRange(
  value: unknown,
  field: string,
  code: string,
): ByteRangeV2 {
  const record = readClosedRecord(value, field, ["start", "end"]);
  const start = readNonNegativeInteger(record.start, `${field}.start`);
  const end = readNonNegativeInteger(record.end, `${field}.end`);
  if (
    end < start ||
    end > utf8ByteLength(code) ||
    !isUtf8Boundary(code, start) ||
    !isUtf8Boundary(code, end)
  ) {
    fail(field, "must be a UTF-8 byte range in generated code");
  }
  return { start, end };
}

function parsePassingStyle(
  value: unknown,
  field: string,
): ParameterPassingStyleV2 {
  switch (readString(value, field)) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2:
      return PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2;
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2:
      return PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2;
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2:
      return PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2;
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2:
      return PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2;
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2:
      return PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2;
    default:
      fail(field, "is not supported");
  }
}

function parseDiagnosticSeverity(
  value: unknown,
  field: string,
): DiagnosticSeverityV2 {
  switch (readString(value, field)) {
    case DIAGNOSTIC_SEVERITY_ERROR_V2:
      return DIAGNOSTIC_SEVERITY_ERROR_V2;
    case DIAGNOSTIC_SEVERITY_WARNING_V2:
      return DIAGNOSTIC_SEVERITY_WARNING_V2;
    case DIAGNOSTIC_SEVERITY_INFORMATION_V2:
      return DIAGNOSTIC_SEVERITY_INFORMATION_V2;
    default:
      fail(field, "is not supported");
  }
}

function parseProviderAvailability(value: unknown): ProviderAvailabilityV2 {
  switch (readString(value, "providerStatus.status")) {
    case PROVIDER_AVAILABILITY_AVAILABLE_V2:
      return PROVIDER_AVAILABILITY_AVAILABLE_V2;
    case PROVIDER_AVAILABILITY_UNAVAILABLE_V2:
      return PROVIDER_AVAILABILITY_UNAVAILABLE_V2;
    default:
      fail("providerStatus.status", "is not supported");
  }
}

function parseProviderLifecycleState(value: unknown): ProviderLifecycleStateV2 {
  switch (readString(value, "providerStatus.state")) {
    case PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2:
      return PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V2;
    case PROVIDER_LIFECYCLE_STATE_PENDING_V2:
      return PROVIDER_LIFECYCLE_STATE_PENDING_V2;
    case PROVIDER_LIFECYCLE_STATE_READY_V2:
      return PROVIDER_LIFECYCLE_STATE_READY_V2;
    case PROVIDER_LIFECYCLE_STATE_FAILED_V2:
      return PROVIDER_LIFECYCLE_STATE_FAILED_V2;
    default:
      fail("providerStatus.state", "is not supported");
  }
}

const apiErrorCodes: ReadonlySet<APIErrorCodeV2> = new Set([
  "revision_conflict",
  "validation_failed",
  "not_found",
  "invalid_request",
  "provider_unavailable",
  "provider_failed",
  "render_failed",
  "materialization_failed",
  "persistence_failed",
  "method_not_allowed",
  "internal",
]);

function parseApiErrorCode(value: unknown): APIErrorCodeV2 {
  const code = readString(value, "error response.error.code");
  if (!apiErrorCodes.has(code as APIErrorCodeV2)) {
    fail("error response.error.code", "is not supported");
  }
  return code as APIErrorCodeV2;
}

function claimTargetId(ids: Set<string>, value: string, field: string): void {
  requireStableId(field, value);
  if (ids.has(value)) {
    fail(field, "must be unique");
  }
  ids.add(value);
}

function claimSectionId(ids: Set<string>, value: string, field: string): void {
  if (ids.has(value)) {
    fail(field, "must be unique");
  }
  ids.add(value);
}

function readSectionId(value: unknown, field: string): string {
  const id = readString(value, field);
  requireStableId(field, id);
  return id;
}

function requireStableId(field: string, value: string): void {
  if (value.trim() === "" || value !== value.trim() || value.includes("\0")) {
    fail(field, "must be a nonblank stable ID");
  }
}

function readStableIdOrNull(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  const id = readString(value, field);
  requireStableId(field, id);
  return id;
}

function readText(value: unknown, field: string, allowEmpty: boolean): string {
  const text = readString(value, field);
  if ((!allowEmpty && text === "") || text.includes("\0")) {
    fail(field, "is invalid");
  }
  return text;
}

function readTextOrNull(value: unknown, field: string): string | null {
  return value === null ? null : readText(value, field, true);
}

export function readNonBlankString(value: unknown, field: string): string {
  const text = readText(value, field, false);
  if (text.trim() === "") {
    fail(field, "must not be empty");
  }
  return text;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    fail(field, "must be a string");
  }
  return value;
}

export function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    fail(field, "must be a boolean");
  }
  return value;
}

export function readPositiveInteger(value: unknown, field: string): number {
  const result = readNonNegativeInteger(value, field);
  if (result < 1) {
    fail(field, "must be positive");
  }
  return result;
}

function readPositiveIntegerOrNull(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : readPositiveInteger(value, field);
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(field, "must be a finite number");
  }
  return value;
}

function readOption<const Values extends readonly string[]>(
  value: unknown,
  field: string,
  options: Values,
): Values[number] {
  const result = readString(value, field);
  if (!options.includes(result)) {
    fail(field, "is not supported");
  }
  return result as Values[number];
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(field, "must be a nonnegative safe integer");
  }
  return value;
}

function readNonNegativeIntegerOrNull(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : readNonNegativeInteger(value, field);
}

function readArray<T>(
  value: unknown,
  field: string,
  parseEntry: (entry: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value)) {
    fail(field, "must be an array");
  }
  return value.map(parseEntry);
}

export function readClosedRecord(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  const record = readPlainRecord(value, field);
  requireExactEnumerableKeys(record, keys, field);
  return record;
}

function readPlainRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(field, "must be an object");
  }
  return value as Record<string, unknown>;
}

function requireExactEnumerableKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const names = Object.getOwnPropertyNames(record);
  if (
    Object.getOwnPropertySymbols(record).length !== 0 ||
    names.length !== keys.length ||
    keys.some(
      (key) =>
        !names.includes(key) ||
        !Object.prototype.propertyIsEnumerable.call(record, key),
    )
  ) {
    fail(field, "must contain exactly the V2 fields");
  }
}

export function fail(field: string, problem: string): never {
  throw new ProjectSnapshotValidationError(field, problem);
}
