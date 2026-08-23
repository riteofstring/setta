import type {
  ParameterUIV2,
} from "../backend/generatedContract";
import type {
  WorkspaceItemControlPresentation,
  WorkspaceItemPresentation,
} from "@setta/workspace";

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

type ValueControl = Exclude<WorkspaceItemControlPresentation, { kind: "group" }>;

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
  switch (ui.type) {
    case "NestedParam":
      return { kind: "group" };
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
    case "SwitchParam":
      return { kind: "switch", value, configuration: ui.configuration };
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
    case "PasswordParam":
      return {
        kind: "password",
        value,
        configuration: {
          ...ui.configuration,
          savedValuePending: false,
        },
      };
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
  switch (control.kind) {
    case "group":
      return { type: "NestedParam", configuration: {} };
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
    case "switch":
      return { type: "SwitchParam", configuration: control.configuration };
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
    case "password": {
      const { savedValuePending: _savedValuePending, ...configuration } =
        control.configuration;
      return { type: "PasswordParam", configuration };
    }
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
  switch (control.kind) {
    case "switch":
      return control.value === "true" ? "True" : "False";
    case "text":
    case "textarea":
    case "dropdown":
    case "color":
    case "password":
    case "date":
    case "time":
      return JSON.stringify(control.value);
    case "dropzone":
      return control.value === "" ? "[]" : control.value;
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

function decodeJSONString(expression: string): string | null {
  try {
    const value: unknown = JSON.parse(expression);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function isDropzoneControl(control: ValueControl): boolean {
  return control.kind === "dropzone";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported parameter UI ${JSON.stringify(value)}.`);
}
