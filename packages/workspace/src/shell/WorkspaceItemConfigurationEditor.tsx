import type { ReactNode } from "react";
import { setItemControlConfiguration } from "../document/itemPresentationMutations";
import { useWorkspaceHost } from "../workspaceHostContext";
import type {
  WorkspaceItemControlConfiguration,
  WorkspaceItemTextLanguage,
} from "../document/types";
import {
  ColorConfigurationEditor,
  ColorParameterConfigurationEditor,
  DropdownConfigurationEditor,
  DropdownParameterConfigurationEditor,
} from "./WorkspaceItemChoiceConfiguration";
import {
  DateConfigurationEditor,
  TimeConfigurationEditor,
} from "./WorkspaceItemDateTimeConfiguration";
import {
  BooleanConfigurationRow,
  DraftNumberConfigurationRow,
  DraftTextConfigurationRow,
  ReadOnlyConfigurationRow,
  SelectConfigurationRow,
  createConfigurationCommit,
  createConfigurationUpdate,
  type ConfigurationCommit,
  type ConfigurationEditorProps,
  type ConfigurationOption,
  type WorkspaceItemValueControl,
} from "./workspaceItemConfigurationFields";

type WorkspaceItemConfigurationEditorProps = {
  sectionId: string;
  itemId: string;
  control: WorkspaceItemValueControl;
  disabled: boolean;
  onEscape: () => void;
  onStatusChange: (message: string) => void;
  surface?: "inspector" | "parameter-config";
};

type TextControl = Extract<
  WorkspaceItemValueControl,
  { kind: "code" | "text" | "textarea" }
>;
type NumericControl = Extract<
  WorkspaceItemValueControl,
  { kind: "rotary" | "slider" }
>;
type PasswordControl = Extract<WorkspaceItemValueControl, { kind: "password" }>;
type DropzoneControl = Extract<WorkspaceItemValueControl, { kind: "dropzone" }>;

const LANGUAGE_OPTIONS: ReadonlyArray<ConfigurationOption> = [
  { label: "Plain text", value: "" },
  { label: "Python", value: "python" },
  { label: "TypeScript", value: "typescript" },
  { label: "JavaScript", value: "javascript" },
  { label: "JSON", value: "json" },
  { label: "YAML", value: "yaml" },
  { label: "TOML", value: "toml" },
  { label: "Markdown", value: "markdown" },
];

function TextConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<TextControl>) {
  const configuration = control.configuration;
  const commit = createConfigurationCommit(control, onCommit);
  return (
    <>
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Placeholder"
        name="text-placeholder"
        onCommit={(placeholder) =>
          commit({
            placeholder: placeholder === "" ? null : placeholder,
          })
        }
        onEscape={onEscape}
        value={configuration.placeholder ?? ""}
      />
      {control.kind === "code" ? (
        <SelectConfigurationRow
          disabled={disabled}
          label="Language"
          name="code-language"
          onChange={(language) =>
            commit({
              language: language as WorkspaceItemTextLanguage,
            })
          }
          onEscape={onEscape}
          options={LANGUAGE_OPTIONS.slice(1)}
          value={control.configuration.language}
        />
      ) : null}
      {control.kind === "textarea" ? (
        <SelectConfigurationRow
          disabled={disabled}
          label="Language"
          name="textarea-language"
          onChange={(language) =>
            commit({
              language:
                language === ""
                  ? null
                  : (language as WorkspaceItemTextLanguage),
            })
          }
          onEscape={onEscape}
          options={LANGUAGE_OPTIONS}
          value={control.configuration.language ?? ""}
        />
      ) : null}
      <ReadOnlyConfigurationRow label="Autocomplete" value="Off" />
      {control.kind === "text" || control.kind === "code" ? (
        <>
          <BooleanConfigurationRow
            checked={control.configuration.singleLine}
            disabled={disabled}
            label="Single line"
            onChange={(singleLine) =>
              commit({
                singleLine,
              })
            }
            onEscape={onEscape}
          />
          <BooleanConfigurationRow
            checked={control.configuration.wrapLines}
            disabled={disabled}
            label="Wrap lines"
            onChange={(wrapLines) =>
              commit({
                wrapLines,
              })
            }
            onEscape={onEscape}
          />
        </>
      ) : null}
    </>
  );
}

function NumericConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<NumericControl>) {
  const commit = createConfigurationCommit(control, onCommit);
  const configuration = control.configuration;
  const commitField = (field: "max" | "min" | "step", value: number) =>
    commit({
      [field]: value,
    });
  const validateField = (
    field: "max" | "min" | "step",
    value: number,
  ): string | null => {
    const next = { ...configuration, [field]: value };
    if (next.min >= next.max) {
      return "min must be less than max.";
    }
    if (next.step <= 0 || next.step > next.max - next.min) {
      return "step must be greater than zero and no larger than max minus min.";
    }
    return null;
  };
  return (
    <>
      {(["min", "max", "step"] as const).map((field) => (
        <DraftNumberConfigurationRow
          disabled={disabled}
          key={field}
          label={field}
          name={`numeric-${field}`}
          onCommit={(value) => commitField(field, value)}
          onEscape={onEscape}
          validate={(value) => validateField(field, value)}
          value={configuration[field]}
        />
      ))}
    </>
  );
}

function PasswordConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<PasswordControl>) {
  const commit = createConfigurationCommit(control, onCommit);
  return (
    <>
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Placeholder"
        name="password-placeholder"
        onCommit={(placeholder) =>
          commit({
            placeholder: placeholder === "" ? null : placeholder,
          })
        }
        onEscape={onEscape}
        value={control.configuration.placeholder ?? ""}
      />
      <BooleanConfigurationRow
        checked={control.configuration.savedValuePending}
        disabled={disabled}
        label="Saved value pending"
        onChange={(savedValuePending) =>
          commit({
            savedValuePending,
          })
        }
        onEscape={onEscape}
      />
    </>
  );
}

function parseOptionalPositiveInteger(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function validateOptionalPositiveInteger(value: string): string | null {
  const parsed = parseOptionalPositiveInteger(value);
  return parsed === null || (Number.isSafeInteger(parsed) && parsed > 0)
    ? null
    : "Enter a positive integer or leave this field blank.";
}

function validateMaximumAttachments(
  value: string,
  attachmentCount: number,
): string | null {
  const positiveIntegerError = validateOptionalPositiveInteger(value);
  if (positiveIntegerError) {
    return positiveIntegerError;
  }
  const maximum = parseOptionalPositiveInteger(value);
  return maximum !== null && maximum < attachmentCount
    ? `Maximum attachments cannot be lower than the current attachment count (${attachmentCount}).`
    : null;
}

function DropzoneConfigurationEditor({
  control,
  disabled,
  onCommit,
  onEscape,
}: ConfigurationEditorProps<DropzoneControl>) {
  const commit = createConfigurationCommit(control, onCommit);
  const configuration = control.configuration;
  const policy = configuration.policy;
  return (
    <>
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Placeholder"
        name="dropzone-placeholder"
        onCommit={(placeholder) =>
          commit({
            placeholder,
          })
        }
        onEscape={onEscape}
        placeholder="Drop a file here"
        value={configuration.placeholder}
      />
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Max attachments"
        name="dropzone-max-attachments"
        onCommit={(value) =>
          commit({
            policy: {
              ...policy,
              maxAttachments: parseOptionalPositiveInteger(value),
            },
          })
        }
        onEscape={onEscape}
        placeholder="No limit"
        validate={(value) =>
          validateMaximumAttachments(value, configuration.attachments.length)
        }
        value={
          policy.maxAttachments === null ? "" : String(policy.maxAttachments)
        }
      />
      <DraftNumberConfigurationRow
        disabled={disabled}
        label="Max file bytes"
        min={1}
        name="dropzone-max-file-bytes"
        onCommit={(maxFileBytes) =>
          commit({
            policy: { ...policy, maxFileBytes },
          })
        }
        onEscape={onEscape}
        step={1}
        validate={(value) =>
          Number.isSafeInteger(value) && value > 0
            ? null
            : "Enter a positive integer."
        }
        value={policy.maxFileBytes}
      />
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Max total bytes"
        name="dropzone-max-total-bytes"
        onCommit={(value) =>
          commit({
            policy: {
              ...policy,
              maxTotalBytes: parseOptionalPositiveInteger(value),
            },
          })
        }
        onEscape={onEscape}
        placeholder="No limit"
        validate={validateOptionalPositiveInteger}
        value={
          policy.maxTotalBytes === null ? "" : String(policy.maxTotalBytes)
        }
      />
      <DraftTextConfigurationRow
        disabled={disabled}
        label="Allowed MIME types"
        name="dropzone-mime-prefixes"
        onCommit={(value) =>
          commit({
            policy: {
              ...policy,
              allowedMimePrefixes: value
                .split(",")
                .map((prefix) => prefix.trim())
                .filter((prefix) => prefix !== ""),
            },
          })
        }
        onEscape={onEscape}
        placeholder="image/, text/plain"
        spellCheck={false}
        value={policy.allowedMimePrefixes.join(", ")}
      />
      <ReadOnlyConfigurationRow
        label="Attachments"
        value={configuration.attachments.length}
      />
    </>
  );
}

const FIELDLESS_PARAMETER_CONTROL_KINDS: ReadonlySet<string> = new Set([
  "code",
  "password",
  "rotary",
  "switch",
  "text",
  "textarea",
]);

function renderValueConfigurationFields(
  control: WorkspaceItemValueControl,
  props: Omit<ConfigurationEditorProps<WorkspaceItemValueControl>, "control">,
  surface: "inspector" | "parameter-config",
): ReactNode {
  switch (control.kind) {
    case "text":
    case "code":
    case "textarea":
      return <TextConfigurationEditor {...props} control={control} />;
    case "slider":
    case "rotary":
      return <NumericConfigurationEditor {...props} control={control} />;
    case "password":
      return <PasswordConfigurationEditor {...props} control={control} />;
    case "time":
      return <TimeConfigurationEditor {...props} control={control} />;
    case "dropzone":
      return <DropzoneConfigurationEditor {...props} control={control} />;
    default:
      return unsupportedConfiguration(control, surface);
  }
}

function unsupportedConfiguration(
  control: WorkspaceItemValueControl,
  surface: "inspector" | "parameter-config",
): never {
  throw new Error(
    surface === "parameter-config"
      ? `Parameter configuration has no fields for ${JSON.stringify(control)}.`
      : `Inspector has no configuration fields for ${control.kind}.`,
  );
}

function renderConfigurationFields(
  control: WorkspaceItemValueControl,
  disabled: boolean,
  onCommit: ConfigurationCommit,
  onEscape: () => void,
  surface: "inspector" | "parameter-config",
): ReactNode {
  const parameter = surface === "parameter-config";
  if (
    control.kind === "switch" ||
    (parameter && FIELDLESS_PARAMETER_CONTROL_KINDS.has(control.kind))
  ) {
    return null;
  }
  const props = { disabled, onCommit, onEscape };
  switch (control.kind) {
    case "dropdown":
      return parameter ? (
        <DropdownParameterConfigurationEditor {...props} control={control} />
      ) : (
        <DropdownConfigurationEditor {...props} control={control} />
      );
    case "color":
      return parameter ? (
        <ColorParameterConfigurationEditor {...props} control={control} />
      ) : (
        <ColorConfigurationEditor {...props} control={control} />
      );
    case "date":
      return (
        <DateConfigurationEditor
          {...props}
          allowCalendarUI={!parameter}
          control={control}
        />
      );
    default:
      return renderValueConfigurationFields(control, props, surface);
  }
}

function createDisabledUpdate(
  control: WorkspaceItemValueControl,
  disabled: boolean,
): WorkspaceItemControlConfiguration {
  return createConfigurationUpdate(control, {
    ...control.configuration,
    disabled,
  });
}

export function WorkspaceItemConfigurationEditor({
  control,
  disabled,
  itemId,
  onEscape,
  onStatusChange,
  sectionId,
  surface = "inspector",
}: WorkspaceItemConfigurationEditorProps) {
  const host = useWorkspaceHost();
  function commitUpdate(update: WorkspaceItemControlConfiguration): void {
    if (update.kind !== control.kind) {
      throw new Error(
        `Inspector ${control.kind} configuration received a ${String(update.kind)} update.`,
      );
    }
    setItemControlConfiguration(host, sectionId, itemId, update);
    onStatusChange(`${control.kind} configuration updated.`);
  }
  const fields = renderConfigurationFields(
    control,
    disabled,
    commitUpdate,
    onEscape,
    surface,
  );
  if (surface === "parameter-config" && fields === null) {
    return null;
  }

  return (
    <div
      aria-label={`${control.kind} configuration`}
      className="setta-workspace-inspector-config"
      role="group"
    >
      {fields}
      {surface === "inspector" ? (
        <BooleanConfigurationRow
          checked={control.configuration.disabled}
          disabled={disabled}
          label="Disable control"
          onChange={(nextDisabled) =>
            commitUpdate(createDisabledUpdate(control, nextDisabled))
          }
          onEscape={onEscape}
        />
      ) : null}
    </div>
  );
}
