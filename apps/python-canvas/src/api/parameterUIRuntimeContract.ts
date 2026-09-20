import type { ParameterUIV2 } from "./generatedContract";
import {
  fail,
  readArray,
  readBoolean,
  readClosedRecord,
  readFiniteNumber,
  readNonBlankString,
  readOption,
  readPositiveInteger,
  readPositiveIntegerOrNull,
  readString,
  readText,
  readTextOrNull,
} from "./runtimeContractPrimitives";

export function parseConfigurableParameterUI(
  value: unknown,
  field: string,
): Exclude<ParameterUIV2, { type: "NestedParam" }> {
  const ui = parseParameterUI(value, field);
  if (ui.type === "NestedParam") {
    fail(`${field}.type`, "is only valid for a dictionary parent");
  }
  return ui;
}

export function parseNestedParameterUI(
  value: unknown,
  field: string,
): Extract<ParameterUIV2, { type: "NestedParam" }> {
  const ui = parseParameterUI(value, field);
  if (ui.type !== "NestedParam") {
    fail(`${field}.type`, "must be NestedParam for a dictionary parent");
  }
  return ui;
}

type ParameterUIType = ParameterUIV2["type"];
type TextParameterUIType =
  "CodeParam" | "PasswordParam" | "TextAreaParam" | "TextParam";
type ChoiceParameterUIType =
  "ColorPickerParam" | "DropdownParam" | "RotaryParam" | "SliderParam";
type SpecialParameterUIType = "DateParam" | "DropzoneParam" | "TimeParam";
type SimpleParameterUIType = "NestedParam" | "SwitchParam";

const TEXT_PARAMETER_UI_TYPES: ReadonlySet<string> = new Set([
  "CodeParam",
  "PasswordParam",
  "TextAreaParam",
  "TextParam",
]);
const CHOICE_PARAMETER_UI_TYPES: ReadonlySet<string> = new Set([
  "ColorPickerParam",
  "DropdownParam",
  "RotaryParam",
  "SliderParam",
]);
const SPECIAL_PARAMETER_UI_TYPES: ReadonlySet<string> = new Set([
  "DateParam",
  "DropzoneParam",
  "TimeParam",
]);
const SIMPLE_PARAMETER_UI_TYPES: ReadonlySet<string> = new Set([
  "NestedParam",
  "SwitchParam",
]);

function isTextParameterUIType(value: string): value is TextParameterUIType {
  return TEXT_PARAMETER_UI_TYPES.has(value);
}

function isChoiceParameterUIType(
  value: string,
): value is ChoiceParameterUIType {
  return CHOICE_PARAMETER_UI_TYPES.has(value);
}

function isSpecialParameterUIType(
  value: string,
): value is SpecialParameterUIType {
  return SPECIAL_PARAMETER_UI_TYPES.has(value);
}

function isSimpleParameterUIType(
  value: string,
): value is SimpleParameterUIType {
  return SIMPLE_PARAMETER_UI_TYPES.has(value);
}

function parseParameterUI(value: unknown, field: string): ParameterUIV2 {
  const record = readClosedRecord(value, field, ["type", "configuration"]);
  const type = readString(record.type, `${field}.type`);
  const configurationField = `${field}.configuration`;
  if (isTextParameterUIType(type)) {
    return parseTextParameterUI(type, record.configuration, configurationField);
  }
  if (isChoiceParameterUIType(type)) {
    return parseChoiceParameterUI(
      type,
      record.configuration,
      configurationField,
    );
  }
  if (isSpecialParameterUIType(type)) {
    return parseSpecialParameterUI(
      type,
      record.configuration,
      configurationField,
    );
  }
  if (isSimpleParameterUIType(type)) {
    return parseSimpleParameterUI(
      type,
      record.configuration,
      configurationField,
    );
  }
  fail(`${field}.type`, "is not supported");
}

function parseTextParameterUI(
  type: TextParameterUIType,
  value: unknown,
  field: string,
): ParameterUIV2 {
  switch (type) {
    case "CodeParam": {
      const configuration = parseTextParameterUIConfiguration(
        value,
        field,
        true,
      );
      return {
        type,
        configuration: {
          ...configuration,
          language: readTextLanguage(
            readClosedRecord(value, field, [
              "disabled",
              "language",
              "placeholder",
              "singleLine",
              "wrapLines",
            ]).language,
            `${field}.language`,
          ),
        },
      };
    }
    case "TextParam":
      return {
        type,
        configuration: parseTextParameterUIConfiguration(value, field, false),
      };
    case "TextAreaParam": {
      const configuration = readClosedRecord(value, field, [
        "disabled",
        "language",
        "placeholder",
      ]);
      return {
        type,
        configuration: {
          disabled: readBoolean(configuration.disabled, `${field}.disabled`),
          language:
            configuration.language === null
              ? null
              : readTextLanguage(configuration.language, `${field}.language`),
          placeholder: readTextOrNull(
            configuration.placeholder,
            `${field}.placeholder`,
          ),
        },
      };
    }
    case "PasswordParam": {
      const configuration = readClosedRecord(value, field, [
        "disabled",
        "placeholder",
      ]);
      return {
        type,
        configuration: {
          disabled: readBoolean(configuration.disabled, `${field}.disabled`),
          placeholder: readTextOrNull(
            configuration.placeholder,
            `${field}.placeholder`,
          ),
        },
      };
    }
  }
}

function parseChoiceParameterUI(
  type: ChoiceParameterUIType,
  value: unknown,
  field: string,
): ParameterUIV2 {
  switch (type) {
    case "DropdownParam":
      return {
        type,
        configuration: parseDropdownParameterUIConfiguration(value, field),
      };
    case "ColorPickerParam":
      return {
        type,
        configuration: parseColorParameterUIConfiguration(value, field),
      };
    case "SliderParam":
    case "RotaryParam":
      return {
        type,
        configuration: parseNumericParameterUIConfiguration(value, field),
      };
  }
}

function parseSpecialParameterUI(
  type: SpecialParameterUIType,
  value: unknown,
  field: string,
): ParameterUIV2 {
  switch (type) {
    case "DateParam":
      return {
        type,
        configuration: parseDateParameterUIConfiguration(value, field),
      };
    case "TimeParam":
      return {
        type,
        configuration: parseTimeParameterUIConfiguration(value, field),
      };
    case "DropzoneParam":
      return {
        type,
        configuration: parseDropzoneParameterUIConfiguration(value, field),
      };
  }
}

function parseSimpleParameterUI(
  type: SimpleParameterUIType,
  value: unknown,
  field: string,
): ParameterUIV2 {
  if (type === "NestedParam") {
    readClosedRecord(value, field, []);
    return { type, configuration: {} };
  }
  const configuration = readClosedRecord(value, field, ["disabled"]);
  return {
    type,
    configuration: {
      disabled: readBoolean(configuration.disabled, `${field}.disabled`),
    },
  };
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

function parseDropdownParameterUIConfiguration(value: unknown, field: string) {
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
          readNonBlankString(choice, `${field}.flatChoices[${String(index)}]`),
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
            const color = readString(
              choiceRecord.color,
              `${choiceField}.color`,
            );
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
    selectionMode: readOption(record.selectionMode, `${field}.selectionMode`, [
      "single",
      "multiple",
    ] as const),
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
    displayFormat: readOption(record.displayFormat, `${field}.displayFormat`, [
      "twenty_four_hour",
      "twelve_hour",
    ] as const),
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
):
  | "python"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "toml"
  | "markdown" {
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
