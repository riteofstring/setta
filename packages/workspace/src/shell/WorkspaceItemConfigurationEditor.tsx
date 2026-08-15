import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { assertWorkspaceItemControlConfiguration } from "../document/itemPresentation";
import { setItemControlConfiguration } from "../document/itemPresentationMutations";
import type {
  WorkspaceItemControlConfiguration,
  WorkspaceItemControlPresentation,
} from "../document/types";

type ValueControl = Exclude<WorkspaceItemControlPresentation, { kind: "group" }>;
type ConfigurationError = { field: string; message: string };
type ParseResult =
  | { ok: true; update: WorkspaceItemControlConfiguration }
  | { ok: false; error: ConfigurationError };

type WorkspaceItemConfigurationEditorProps = {
  sectionId: string;
  itemId: string;
  control: ValueControl;
  disabled: boolean;
  onEscape: () => void;
  onStatusChange: (message: string) => void;
};

type FieldInputProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  className: string;
  id: string;
  name: string;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

const ConfigurationEscapeContext = createContext<(() => void) | null>(null);

function useConfigurationEscapeHandler(): (event: KeyboardEvent<HTMLElement>) => void {
  const onEscape = useContext(ConfigurationEscapeContext);
  if (!onEscape) {
    throw new Error("Inspector configuration fields require an Escape focus target.");
  }
  return (event) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onEscape();
  };
}

function ConfigurationField({
  children,
  description,
  error,
  label,
  name,
}: {
  children: (props: FieldInputProps) => ReactNode;
  description?: string;
  error: ConfigurationError | null;
  label: string;
  name: string;
}) {
  const handleEscape = useConfigurationEscapeHandler();
  const reactId = useId().replaceAll(":", "");
  const inputId = `setta-inspector-${name}-${reactId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error?.field === name ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="setta-workspace-inspector-field">
      <label className="setta-workspace-inspector-label" htmlFor={inputId}>
        {label}
      </label>
      {children({
        id: inputId,
        name,
        className: "setta-workspace-inspector-input",
        onKeyDown: handleEscape,
        "aria-describedby": describedBy,
        "aria-invalid": errorId ? true : undefined,
      })}
      {description ? (
        <p className="setta-workspace-inspector-help" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {errorId ? (
        <p className="setta-workspace-inspector-error" id={errorId}>
          {error?.message}
        </p>
      ) : null}
    </div>
  );
}

function ConfigurationCheckbox({
  checked,
  disabled,
  label,
  name,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  name: string;
}) {
  const handleEscape = useConfigurationEscapeHandler();
  return (
    <label className="setta-workspace-inspector-checkbox">
      <input
        defaultChecked={checked}
        disabled={disabled}
        name={name}
        onKeyDown={handleEscape}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function PlaceholderField({
  disabled,
  error,
  placeholder,
}: {
  disabled: boolean;
  error: ConfigurationError | null;
  placeholder: string | null;
}) {
  return (
    <ConfigurationField error={error} label="Placeholder" name="placeholder">
      {(props) => <input {...props} defaultValue={placeholder ?? ""} disabled={disabled} />}
    </ConfigurationField>
  );
}

function LanguageField({
  disabled,
  error,
  language,
  nullable,
}: {
  disabled: boolean;
  error: ConfigurationError | null;
  language: string | null;
  nullable: boolean;
}) {
  return (
    <ConfigurationField error={error} label="Language" name="language">
      {(props) => (
        <select {...props} defaultValue={language ?? ""} disabled={disabled}>
          {nullable ? <option value="">Plain text</option> : null}
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="json">JSON</option>
          <option value="yaml">YAML</option>
          <option value="toml">TOML</option>
          <option value="markdown">Markdown</option>
        </select>
      )}
    </ConfigurationField>
  );
}

function TextConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "code" | "text" | "textarea" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  const configuration = control.configuration;
  return (
    <>
      <PlaceholderField disabled={disabled} error={error} placeholder={configuration.placeholder} />
      {control.kind === "code" || control.kind === "textarea" ? (
        <LanguageField
          disabled={disabled}
          error={error}
          language={control.configuration.language}
          nullable={control.kind === "textarea"}
        />
      ) : null}
      <div className="setta-workspace-inspector-readonly-row">
        <span>Autocomplete</span>
        <span className="setta-workspace-inspector-readonly-value">Off</span>
      </div>
      {control.kind === "text" || control.kind === "code" ? (
        <>
          <ConfigurationCheckbox
            checked={control.configuration.singleLine}
            disabled={disabled}
            label="Single line"
            name="singleLine"
          />
          <ConfigurationCheckbox
            checked={control.configuration.wrapLines}
            disabled={disabled}
            label="Wrap lines"
            name="wrapLines"
          />
        </>
      ) : null}
      <ConfigurationCheckbox
        checked={configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function ChoiceConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "color" | "dropdown" | "switch" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  if (control.kind === "switch") {
    return (
      <ConfigurationCheckbox
        checked={control.configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    );
  }
  const choices = JSON.stringify(control.configuration.choices, null, 2);
  return (
    <>
      {control.kind === "dropdown" ? (
        <PlaceholderField
          disabled={disabled}
          error={error}
          placeholder={control.configuration.placeholder}
        />
      ) : null}
      <ConfigurationField
        description={
          control.kind === "dropdown"
            ? "Use a JSON array of strings or named choice groups."
            : "Use null for the native picker or a JSON array of color and description objects."
        }
        error={error}
        label="Choices"
        name="choices"
      >
        {(props) => (
          <textarea
            {...props}
            defaultValue={choices}
            disabled={disabled}
            rows={5}
            spellCheck={false}
          />
        )}
      </ConfigurationField>
      <ConfigurationCheckbox
        checked={control.configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function NumericConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "rotary" | "slider" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  return (
    <>
      {(["min", "max", "step"] as const).map((field) => (
        <ConfigurationField
          error={error}
          key={field}
          label={field === "min" ? "Minimum" : field === "max" ? "Maximum" : "Step"}
          name={field}
        >
          {(props) => (
            <input
              {...props}
              defaultValue={control.configuration[field]}
              disabled={disabled}
              inputMode="decimal"
              required
              step="any"
              type="number"
            />
          )}
        </ConfigurationField>
      ))}
      <ConfigurationCheckbox
        checked={control.configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function DateConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "date" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  const configuration = control.configuration;
  return (
    <>
      <SelectField
        disabled={disabled}
        error={error}
        label="Control mode"
        name="controlMode"
        value={configuration.controlMode}
        options={["input", "calendar"]}
      />
      <SelectField
        disabled={disabled}
        error={error}
        label="Display format"
        name="displayFormat"
        value={configuration.displayFormat}
        options={["iso", "us", "eu", "long"]}
      />
      <SelectField
        disabled={disabled}
        error={error}
        label="Selection mode"
        name="selectionMode"
        value={configuration.selectionMode}
        options={["single", "multiple"]}
      />
      <SelectField
        disabled={disabled}
        error={error}
        label="Week starts"
        name="weekStart"
        value={configuration.weekStart}
        options={["sunday", "monday"]}
      />
      <SelectField
        disabled={disabled}
        error={error}
        label="Time format"
        name="timeDisplayFormat"
        value={configuration.timeDisplayFormat}
        options={["twenty_four_hour", "twelve_hour"]}
      />
      <ConfigurationCheckbox
        checked={configuration.includeTime}
        disabled={disabled}
        label="Include time"
        name="includeTime"
      />
      <ConfigurationCheckbox
        checked={configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function SelectField({
  disabled,
  error,
  label,
  name,
  options,
  value,
}: {
  disabled: boolean;
  error: ConfigurationError | null;
  label: string;
  name: string;
  options: ReadonlyArray<string>;
  value: string;
}) {
  return (
    <ConfigurationField error={error} label={label} name={name}>
      {(props) => (
        <select {...props} defaultValue={value} disabled={disabled}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      )}
    </ConfigurationField>
  );
}

function TimeConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "time" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  const configuration = control.configuration;
  return (
    <>
      <SelectField
        disabled={disabled}
        error={error}
        label="Control mode"
        name="controlMode"
        value={configuration.controlMode}
        options={["input", "display"]}
      />
      <SelectField
        disabled={disabled}
        error={error}
        label="Display format"
        name="displayFormat"
        value={configuration.displayFormat}
        options={["twenty_four_hour", "twelve_hour"]}
      />
      <SelectField
        disabled={disabled}
        error={error}
        label="Font"
        name="font"
        value={configuration.font}
        options={["clock", "monospace", "system"]}
      />
      <ConfigurationField error={error} label="Scale" name="scale">
        {(props) => (
          <input
            {...props}
            defaultValue={configuration.scale}
            disabled={disabled}
            max="3"
            min="0.5"
            required
            step="0.1"
            type="number"
          />
        )}
      </ConfigurationField>
      <ConfigurationCheckbox
        checked={configuration.transparent}
        disabled={disabled}
        label="Transparent display"
        name="transparent"
      />
      <ConfigurationCheckbox
        checked={configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function PasswordConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "password" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  return (
    <>
      <PlaceholderField
        disabled={disabled}
        error={error}
        placeholder={control.configuration.placeholder}
      />
      <ConfigurationCheckbox
        checked={control.configuration.savedValuePending}
        disabled={disabled}
        label="Saved value pending"
        name="savedValuePending"
      />
      <ConfigurationCheckbox
        checked={control.configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function DropzoneConfigurationFields({
  control,
  disabled,
  error,
}: {
  control: Extract<ValueControl, { kind: "dropzone" }>;
  disabled: boolean;
  error: ConfigurationError | null;
}) {
  const configuration = control.configuration;
  return (
    <>
      <ConfigurationField error={error} label="Placeholder" name="placeholder">
        {(props) => (
          <input {...props} defaultValue={configuration.placeholder} disabled={disabled} />
        )}
      </ConfigurationField>
      <OptionalIntegerField
        disabled={disabled}
        error={error}
        label="Maximum attachments"
        name="maxAttachments"
        value={configuration.policy.maxAttachments}
      />
      <ConfigurationField error={error} label="Maximum file bytes" name="maxFileBytes">
        {(props) => (
          <input
            {...props}
            defaultValue={configuration.policy.maxFileBytes}
            disabled={disabled}
            min="1"
            required
            step="1"
            type="number"
          />
        )}
      </ConfigurationField>
      <OptionalIntegerField
        disabled={disabled}
        error={error}
        label="Maximum total bytes"
        name="maxTotalBytes"
        value={configuration.policy.maxTotalBytes}
      />
      <ConfigurationField
        description="One trimmed MIME prefix per line."
        error={error}
        label="Allowed MIME prefixes"
        name="allowedMimePrefixes"
      >
        {(props) => (
          <textarea
            {...props}
            defaultValue={configuration.policy.allowedMimePrefixes.join("\n")}
            disabled={disabled}
            rows={3}
            spellCheck={false}
          />
        )}
      </ConfigurationField>
      <div className="setta-workspace-inspector-readonly-row">
        <span>Attachments</span>
        <span className="setta-workspace-inspector-readonly-value">
          {configuration.attachments.length}
        </span>
      </div>
      <ConfigurationCheckbox
        checked={configuration.disabled}
        disabled={disabled}
        label="Disable control"
        name="disabled"
      />
    </>
  );
}

function OptionalIntegerField({
  disabled,
  error,
  label,
  name,
  value,
}: {
  disabled: boolean;
  error: ConfigurationError | null;
  label: string;
  name: string;
  value: number | null;
}) {
  return (
    <ConfigurationField error={error} label={label} name={name}>
      {(props) => (
        <input
          {...props}
          defaultValue={value ?? ""}
          disabled={disabled}
          min="1"
          step="1"
          type="number"
        />
      )}
    </ConfigurationField>
  );
}

function renderTextAndChoiceConfigurationFields(
  control: ValueControl,
  disabled: boolean,
  error: ConfigurationError | null,
): ReactNode | null {
  if (control.kind === "text" || control.kind === "code" || control.kind === "textarea") {
    return <TextConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  if (control.kind === "switch" || control.kind === "dropdown" || control.kind === "color") {
    return <ChoiceConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  return null;
}

function renderRemainingConfigurationFields(
  control: ValueControl,
  disabled: boolean,
  error: ConfigurationError | null,
): ReactNode {
  if (control.kind === "slider" || control.kind === "rotary") {
    return <NumericConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  if (control.kind === "date") {
    return <DateConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  if (control.kind === "time") {
    return <TimeConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  if (control.kind === "password") {
    return <PasswordConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  if (control.kind === "dropzone") {
    return <DropzoneConfigurationFields control={control} disabled={disabled} error={error} />;
  }
  throw new Error(`Inspector has no configuration fields for ${control.kind}.`);
}

function renderConfigurationFields(
  control: ValueControl,
  disabled: boolean,
  error: ConfigurationError | null,
): ReactNode {
  return (
    renderTextAndChoiceConfigurationFields(control, disabled, error) ??
    renderRemainingConfigurationFields(control, disabled, error)
  );
}

function requiredString(form: FormData, field: string): string {
  const value = form.get(field);
  if (typeof value !== "string") {
    throw new Error(`Inspector configuration form is missing ${field}.`);
  }
  return value;
}

function checked(form: FormData, field: string): boolean {
  return form.get(field) === "on";
}

function nullableString(form: FormData, field: string): string | null {
  const value = requiredString(form, field);
  return value === "" ? null : value;
}

function validateUpdate(update: unknown, errorField: string): ParseResult {
  try {
    assertWorkspaceItemControlConfiguration(update, "Inspector configuration");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return { ok: false, error: { field: errorField, message: error.message } };
  }
  return { ok: true, update };
}

function parseJsonField(
  form: FormData,
  field: string,
): { ok: true; value: unknown } | { ok: false; error: ConfigurationError } {
  try {
    return { ok: true, value: JSON.parse(requiredString(form, field)) as unknown };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    return { ok: false, error: { field, message: `${field} must be valid JSON.` } };
  }
}

function parseTextConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind !== "text" && control.kind !== "code" && control.kind !== "textarea") {
    return null;
  }
  const base = {
    autocomplete: "off" as const,
    disabled: checked(form, "disabled"),
    placeholder: nullableString(form, "placeholder"),
  };
  if (control.kind === "text") {
    return validateUpdate(
      {
        kind: "text",
        configuration: {
          ...base,
          singleLine: checked(form, "singleLine"),
          wrapLines: checked(form, "wrapLines"),
        },
      },
      "placeholder",
    );
  }
  if (control.kind === "code") {
    return validateUpdate(
      {
        kind: "code",
        configuration: {
          ...base,
          language: requiredString(form, "language"),
          singleLine: checked(form, "singleLine"),
          wrapLines: checked(form, "wrapLines"),
        },
      },
      "language",
    );
  }
  if (control.kind === "textarea") {
    return validateUpdate(
      {
        kind: "textarea",
        configuration: { ...base, language: nullableString(form, "language") },
      },
      "language",
    );
  }
  return null;
}

function parseChoiceConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind === "switch") {
    return validateUpdate(
      { kind: "switch", configuration: { disabled: checked(form, "disabled") } },
      "disabled",
    );
  }
  if (control.kind !== "dropdown" && control.kind !== "color") {
    return null;
  }
  const choices = parseJsonField(form, "choices");
  if (!choices.ok) {
    return choices;
  }
  const configuration = { choices: choices.value, disabled: checked(form, "disabled") };
  return validateUpdate(
    control.kind === "dropdown"
      ? {
          kind: "dropdown",
          configuration: { ...configuration, placeholder: nullableString(form, "placeholder") },
        }
      : { kind: "color", configuration },
    "choices",
  );
}

function parseFiniteNumber(form: FormData, field: string): number | ConfigurationError {
  const value = Number(requiredString(form, field));
  return Number.isFinite(value) ? value : { field, message: `${field} must be a finite number.` };
}

function parseNumericConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind !== "slider" && control.kind !== "rotary") {
    return null;
  }
  const min = parseFiniteNumber(form, "min");
  const max = parseFiniteNumber(form, "max");
  const step = parseFiniteNumber(form, "step");
  const error = [min, max, step].find(
    (value): value is ConfigurationError => typeof value !== "number",
  );
  if (error) {
    return { ok: false, error };
  }
  return validateUpdate(
    {
      kind: control.kind,
      configuration: { disabled: checked(form, "disabled"), min, max, step },
    },
    "min",
  );
}

function parseDateConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind !== "date") {
    return null;
  }
  return validateUpdate(
    {
      kind: "date",
      configuration: {
        controlMode: requiredString(form, "controlMode"),
        disabled: checked(form, "disabled"),
        displayFormat: requiredString(form, "displayFormat"),
        includeTime: checked(form, "includeTime"),
        selectionMode: requiredString(form, "selectionMode"),
        timeDisplayFormat: requiredString(form, "timeDisplayFormat"),
        weekStart: requiredString(form, "weekStart"),
      },
    },
    "controlMode",
  );
}

function parseTimeConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind !== "time") {
    return null;
  }
  return validateUpdate(
    {
      kind: "time",
      configuration: {
        controlMode: requiredString(form, "controlMode"),
        disabled: checked(form, "disabled"),
        displayFormat: requiredString(form, "displayFormat"),
        font: requiredString(form, "font"),
        scale: Number(requiredString(form, "scale")),
        transparent: checked(form, "transparent"),
      },
    },
    "scale",
  );
}

function parseOptionalInteger(form: FormData, field: string): number | null | ConfigurationError {
  const raw = requiredString(form, field);
  if (raw === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0
    ? value
    : { field, message: `${field} must be blank or a positive integer.` };
}

function parseDropzoneConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind !== "dropzone") {
    return null;
  }
  const maxAttachments = parseOptionalInteger(form, "maxAttachments");
  const maxTotalBytes = parseOptionalInteger(form, "maxTotalBytes");
  const maxFileBytes = parseOptionalInteger(form, "maxFileBytes");
  const error = [maxAttachments, maxTotalBytes, maxFileBytes].find(
    (value): value is ConfigurationError => typeof value === "object" && value !== null,
  );
  if (error) {
    return { ok: false, error };
  }
  if (maxFileBytes === null) {
    return {
      ok: false,
      error: { field: "maxFileBytes", message: "maxFileBytes must be a positive integer." },
    };
  }
  const allowedMimePrefixes = requiredString(form, "allowedMimePrefixes")
    .split("\n")
    .map((prefix) => prefix.trim())
    .filter((prefix) => prefix !== "");
  return validateUpdate(
    {
      kind: "dropzone",
      configuration: {
        ...control.configuration,
        disabled: checked(form, "disabled"),
        placeholder: requiredString(form, "placeholder"),
        policy: { allowedMimePrefixes, maxAttachments, maxFileBytes, maxTotalBytes },
      },
    },
    "allowedMimePrefixes",
  );
}

function parsePasswordConfiguration(control: ValueControl, form: FormData): ParseResult | null {
  if (control.kind !== "password") {
    return null;
  }
  return validateUpdate(
    {
      kind: "password",
      configuration: {
        disabled: checked(form, "disabled"),
        placeholder: nullableString(form, "placeholder"),
        savedValuePending: checked(form, "savedValuePending"),
      },
    },
    "placeholder",
  );
}

function parseConfiguration(control: ValueControl, form: FormData): ParseResult {
  const result =
    parseTextConfiguration(control, form) ??
    parseChoiceConfiguration(control, form) ??
    parseNumericConfiguration(control, form) ??
    parseDateConfiguration(control, form) ??
    parseTimeConfiguration(control, form) ??
    parsePasswordConfiguration(control, form) ??
    parseDropzoneConfiguration(control, form);
  if (!result) {
    throw new Error(`Inspector has no configuration parser for ${control.kind}.`);
  }
  return result;
}

export function WorkspaceItemConfigurationEditor({
  control,
  disabled,
  itemId,
  onEscape,
  onStatusChange,
  sectionId,
}: WorkspaceItemConfigurationEditorProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<ConfigurationError | null>(null);

  useEffect(() => {
    formRef.current?.reset();
    setError(null);
  }, [control.configuration]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = parseConfiguration(control, new FormData(event.currentTarget));
    if (!result.ok) {
      setError(result.error);
      const target = event.currentTarget.elements.namedItem(result.error.field);
      if (!(target instanceof HTMLElement)) {
        throw new Error(
          `Inspector cannot focus invalid configuration field ${result.error.field}.`,
        );
      }
      target.focus();
      return;
    }
    setError(null);
    setItemControlConfiguration(sectionId, itemId, result.update);
    onStatusChange(`${control.kind} configuration updated.`);
  }

  function cancelConfiguration(): void {
    formRef.current?.reset();
    setError(null);
    onEscape();
  }

  return (
    <ConfigurationEscapeContext.Provider value={cancelConfiguration}>
      <form className="setta-workspace-inspector-config" onSubmit={handleSubmit} ref={formRef}>
        <h4>Configuration</h4>
        {renderConfigurationFields(control, disabled, error)}
        <button
          className="setta-workspace-inspector-primary-action"
          disabled={disabled}
          type="submit"
        >
          Apply configuration
        </button>
      </form>
    </ConfigurationEscapeContext.Provider>
  );
}
