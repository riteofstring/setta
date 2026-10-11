import type { ParameterUIV2 } from "../api/generatedContract";
import type {
  WorkspaceItemControlPresentation,
  WorkspaceItemPresentation,
} from "@riteofstring/setta";

export type ConfigurableParameterUIV2 = Exclude<
  ParameterUIV2,
  { type: "NestedParam" }
>;

export function defaultCodeParameterUI(): ConfigurableParameterUIV2 {
  return {
    type: "CodeParam",
    configuration: {
      disabled: false,
      language: "python",
      placeholder: null,
      singleLine: true,
      wrapLines: true,
    },
  };
}

type ValueControl = Exclude<
  WorkspaceItemControlPresentation,
  { kind: "group" }
>;
type TextParameterUI = Extract<
  ParameterUIV2,
  { type: "CodeParam" | "PasswordParam" | "TextAreaParam" | "TextParam" }
>;
type ChoiceParameterUI = Extract<
  ParameterUIV2,
  { type: "ColorPickerParam" | "DropdownParam" | "RotaryParam" | "SliderParam" }
>;
type RemainingParameterUI = Exclude<
  ParameterUIV2,
  TextParameterUI | ChoiceParameterUI
>;
type TextValueControl = Extract<
  ValueControl,
  {
    kind:
      "color" | "date" | "dropdown" | "password" | "text" | "textarea" | "time";
  }
>;
type SpecialValueControl = Extract<
  ValueControl,
  { kind: "dropzone" | "switch" }
>;
type RawValueControl = Exclude<
  ValueControl,
  TextValueControl | SpecialValueControl
>;

export function projectParameterPresentation({
  expression,
  label,
  labelEditable,
  ui,
}: {
  expression: string;
  label: string;
  labelEditable: boolean;
  ui: ParameterUIV2;
}): WorkspaceItemPresentation {
  return {
    label,
    labelEditable,
    control: projectParameterControl(ui, expression),
  };
}

export function projectParameterControl(
  ui: ParameterUIV2,
  expression: string,
): WorkspaceItemControlPresentation {
  const value = controlValueFromPythonExpression(ui.type, expression);
  if (isTextParameterUI(ui)) {
    return projectTextParameterControl(ui, value);
  }
  if (isChoiceParameterUI(ui)) {
    return projectChoiceParameterControl(ui, value);
  }
  return projectRemainingParameterControl(ui, value);
}

function projectTextParameterControl(
  ui: TextParameterUI,
  value: string,
): WorkspaceItemControlPresentation {
  switch (ui.type) {
    case "CodeParam":
      return {
        kind: "code",
        value,
        configuration: { ...ui.configuration, autocomplete: "off" },
      };
    case "TextParam":
      return {
        kind: "text",
        value,
        configuration: { ...ui.configuration, autocomplete: "off" },
      };
    case "TextAreaParam":
      return {
        kind: "textarea",
        value,
        configuration: { ...ui.configuration, autocomplete: "off" },
      };
    case "PasswordParam":
      return {
        kind: "password",
        value,
        configuration: {
          ...ui.configuration,
          savedValuePending: false,
        },
      };
    default:
      return assertNever(ui);
  }
}

function projectChoiceParameterControl(
  ui: ChoiceParameterUI,
  value: string,
): WorkspaceItemControlPresentation {
  switch (ui.type) {
    case "DropdownParam":
      return {
        kind: "dropdown",
        value,
        configuration: {
          choices:
            ui.configuration.flatChoices ??
            ui.configuration.groupedChoices ??
            [],
          disabled: ui.configuration.disabled,
          placeholder: ui.configuration.placeholder,
        },
      };
    case "ColorPickerParam":
      return { kind: "color", value, configuration: ui.configuration };
    case "SliderParam":
      return { kind: "slider", value, configuration: ui.configuration };
    case "RotaryParam":
      return { kind: "rotary", value, configuration: ui.configuration };
    default:
      return assertNever(ui);
  }
}

function projectRemainingParameterControl(
  ui: RemainingParameterUI,
  value: string,
): WorkspaceItemControlPresentation {
  switch (ui.type) {
    case "NestedParam":
      return { kind: "group" };
    case "SwitchParam":
      return { kind: "switch", value, configuration: ui.configuration };
    case "DateParam":
      return { kind: "date", value, configuration: ui.configuration };
    case "TimeParam":
      return { kind: "time", value, configuration: ui.configuration };
    case "DropzoneParam":
      return {
        kind: "dropzone",
        value,
        configuration: {
          ...ui.configuration,
          attachments: [],
          errorMessage: null,
          pending: false,
        },
      };
    default:
      return assertNever(ui);
  }
}

export function parameterUIFromWorkspaceControl(
  control: WorkspaceItemControlPresentation,
): ParameterUIV2 {
  if (isTextWorkspaceControl(control)) {
    return parameterUIFromTextControl(control);
  }
  if (isChoiceWorkspaceControl(control)) {
    return parameterUIFromChoiceControl(control);
  }
  return parameterUIFromRemainingControl(control);
}

function parameterUIFromTextControl(
  control: TextParameterControl,
): ParameterUIV2 {
  switch (control.kind) {
    case "code": {
      const { autocomplete: _autocomplete, ...configuration } =
        control.configuration;
      return { type: "CodeParam", configuration };
    }
    case "text": {
      const { autocomplete: _autocomplete, ...configuration } =
        control.configuration;
      return { type: "TextParam", configuration };
    }
    case "textarea": {
      const { autocomplete: _autocomplete, ...configuration } =
        control.configuration;
      return { type: "TextAreaParam", configuration };
    }
    case "password": {
      const { savedValuePending: _savedValuePending, ...configuration } =
        control.configuration;
      return { type: "PasswordParam", configuration };
    }
    default:
      return assertNever(control);
  }
}

function parameterUIFromChoiceControl(
  control: ChoiceParameterControl,
): ParameterUIV2 {
  switch (control.kind) {
    case "dropdown": {
      const choices = control.configuration.choices;
      const grouped = choices.some(
        (choice: string | { group: string; choices: Array<string> }) =>
          typeof choice !== "string",
      );
      return {
        type: "DropdownParam",
        configuration: {
          disabled: control.configuration.disabled,
          placeholder: control.configuration.placeholder,
          flatChoices: grouped ? null : (choices as Array<string>),
          groupedChoices: grouped
            ? (choices as Array<{ group: string; choices: Array<string> }>)
            : null,
        },
      };
    }
    case "color":
      return { type: "ColorPickerParam", configuration: control.configuration };
    case "slider":
      return { type: "SliderParam", configuration: control.configuration };
    case "rotary":
      return { type: "RotaryParam", configuration: control.configuration };
    default:
      return assertNever(control);
  }
}

function parameterUIFromRemainingControl(
  control: RemainingParameterControl,
): ParameterUIV2 {
  switch (control.kind) {
    case "group":
      return { type: "NestedParam", configuration: {} };
    case "switch":
      return { type: "SwitchParam", configuration: control.configuration };
    case "date":
      return { type: "DateParam", configuration: control.configuration };
    case "time":
      return { type: "TimeParam", configuration: control.configuration };
    case "dropzone": {
      const {
        attachments: _attachments,
        errorMessage: _errorMessage,
        pending: _pending,
        ...configuration
      } = control.configuration;
      return { type: "DropzoneParam", configuration };
    }
    default:
      return assertNever(control);
  }
}

export function pythonExpressionFromWorkspaceControl(
  control: WorkspaceItemControlPresentation,
): string {
  if (control.kind === "group") {
    return "";
  }
  if (isTextValueControl(control)) {
    return JSON.stringify(control.value);
  }
  if (isSpecialValueControl(control)) {
    return specialPythonExpression(control);
  }
  return rawPythonExpression(control);
}

function specialPythonExpression(control: SpecialValueControl): string {
  switch (control.kind) {
    case "switch":
      return control.value === "true" ? "True" : "False";
    case "dropzone":
      return control.value === "" ? "[]" : control.value;
    default:
      return assertNever(control);
  }
}

function rawPythonExpression(control: RawValueControl): string {
  switch (control.kind) {
    case "code":
    case "slider":
    case "rotary":
      return control.value;
    default:
      return assertNever(control);
  }
}

export function workspaceControlValue(
  control: WorkspaceItemControlPresentation,
): string {
  return control.kind === "group" ? "" : control.value;
}

function controlValueFromPythonExpression(
  type: ParameterUIV2["type"],
  expression: string,
): string {
  if (type === "SwitchParam") {
    return expression.trim() === "True" ? "true" : "false";
  }
  if (isStringParameterUI(type)) {
    const decoded = decodeJSONString(expression);
    return decoded ?? expression;
  }
  return expression;
}

function isStringParameterUI(type: ParameterUIV2["type"]): boolean {
  return (
    type === "TextParam" ||
    type === "TextAreaParam" ||
    type === "DropdownParam" ||
    type === "ColorPickerParam" ||
    type === "PasswordParam" ||
    type === "DateParam" ||
    type === "TimeParam"
  );
}

type TextParameterControl = Extract<
  WorkspaceItemControlPresentation,
  { kind: "code" | "password" | "text" | "textarea" }
>;
type ChoiceParameterControl = Extract<
  WorkspaceItemControlPresentation,
  { kind: "color" | "dropdown" | "rotary" | "slider" }
>;
type RemainingParameterControl = Exclude<
  WorkspaceItemControlPresentation,
  TextParameterControl | ChoiceParameterControl
>;

function isTextParameterUI(ui: ParameterUIV2): ui is TextParameterUI {
  return (
    ui.type === "CodeParam" ||
    ui.type === "PasswordParam" ||
    ui.type === "TextAreaParam" ||
    ui.type === "TextParam"
  );
}

function isChoiceParameterUI(ui: ParameterUIV2): ui is ChoiceParameterUI {
  return (
    ui.type === "ColorPickerParam" ||
    ui.type === "DropdownParam" ||
    ui.type === "RotaryParam" ||
    ui.type === "SliderParam"
  );
}

function isTextWorkspaceControl(
  control: WorkspaceItemControlPresentation,
): control is TextParameterControl {
  return (
    control.kind === "code" ||
    control.kind === "password" ||
    control.kind === "text" ||
    control.kind === "textarea"
  );
}

function isChoiceWorkspaceControl(
  control: WorkspaceItemControlPresentation,
): control is ChoiceParameterControl {
  return (
    control.kind === "color" ||
    control.kind === "dropdown" ||
    control.kind === "rotary" ||
    control.kind === "slider"
  );
}

function isTextValueControl(
  control: ValueControl,
): control is TextValueControl {
  return (
    control.kind === "color" ||
    control.kind === "date" ||
    control.kind === "dropdown" ||
    control.kind === "password" ||
    control.kind === "text" ||
    control.kind === "textarea" ||
    control.kind === "time"
  );
}

function isSpecialValueControl(
  control: ValueControl,
): control is SpecialValueControl {
  return control.kind === "dropzone" || control.kind === "switch";
}

function decodeJSONString(expression: string): string | null {
  try {
    const value: unknown = JSON.parse(expression);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported parameter UI ${JSON.stringify(value)}.`);
}
