import type { WorkspaceItemControlPresentation } from "../document/types";

export const WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS = [
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
] as const;

export type WorkspaceInspectorItemControlKind =
  (typeof WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS)[number];

type ValueControl = Exclude<
  WorkspaceItemControlPresentation,
  { kind: "group" }
>;
type ControlFactory = (previousValue: string) => ValueControl;

const CONTROL_FACTORIES: Record<
  WorkspaceInspectorItemControlKind,
  ControlFactory
> = {
  text: (value) => ({
    kind: "text",
    value,
    configuration: {
      autocomplete: "off",
      disabled: false,
      placeholder: null,
      singleLine: true,
      wrapLines: true,
    },
  }),
  code: (value) => ({
    kind: "code",
    value,
    configuration: {
      autocomplete: "off",
      disabled: false,
      language: "python",
      placeholder: null,
      singleLine: false,
      wrapLines: true,
    },
  }),
  textarea: (value) => ({
    kind: "textarea",
    value,
    configuration: {
      autocomplete: "off",
      disabled: false,
      language: null,
      placeholder: null,
    },
  }),
  switch: () => ({
    kind: "switch",
    value: "false",
    configuration: { disabled: false },
  }),
  dropdown: (value) => ({
    kind: "dropdown",
    value,
    configuration: { choices: [], disabled: false, placeholder: null },
  }),
  color: () => ({
    kind: "color",
    value: "#000000",
    configuration: { choices: null, disabled: false },
  }),
  slider: () => ({
    kind: "slider",
    value: "0",
    configuration: { disabled: false, min: 0, max: 100, step: 1 },
  }),
  rotary: () => ({
    kind: "rotary",
    value: "0",
    configuration: { disabled: false, min: 0, max: 1, step: 0.1 },
  }),
  password: (value) => ({
    kind: "password",
    value,
    configuration: {
      disabled: false,
      placeholder: null,
      savedValuePending: false,
    },
  }),
  date: () => ({
    kind: "date",
    value: "",
    configuration: {
      controlMode: "input",
      disabled: false,
      displayFormat: "iso",
      includeTime: false,
      selectionMode: "single",
      timeDisplayFormat: "twenty_four_hour",
      weekStart: "sunday",
    },
  }),
  time: () => ({
    kind: "time",
    value: "",
    configuration: {
      controlMode: "input",
      disabled: false,
      displayFormat: "twenty_four_hour",
      font: "system",
      scale: 1,
      transparent: false,
    },
  }),
  dropzone: () => ({
    kind: "dropzone",
    value: "",
    configuration: {
      attachments: [],
      disabled: false,
      errorMessage: null,
      pending: false,
      placeholder: "Drop files here",
      policy: {
        allowedMimePrefixes: [],
        maxAttachments: null,
        maxFileBytes: 26_214_400,
        maxTotalBytes: null,
      },
    },
  }),
};

export function isWorkspaceInspectorItemControlKind(
  value: string,
): value is WorkspaceInspectorItemControlKind {
  return WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS.some((kind) => kind === value);
}

export function createWorkspaceInspectorItemControl(
  kind: WorkspaceInspectorItemControlKind,
  previousValue: string,
): ValueControl {
  return CONTROL_FACTORIES[kind](previousValue);
}
