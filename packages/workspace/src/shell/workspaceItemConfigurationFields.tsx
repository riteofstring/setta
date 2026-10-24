import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { InspectorSwitchControl } from "../controls/switch/SwitchValueControl";
import { assertWorkspaceItemControlConfiguration } from "../document/itemPresentation";
import type {
  WorkspaceItemControlConfiguration,
  WorkspaceItemControlPresentation,
} from "../document/types";

export type WorkspaceItemValueControl = Exclude<
  WorkspaceItemControlPresentation,
  { kind: "group" }
>;
export type ConfigurationCommit = (
  update: WorkspaceItemControlConfiguration,
) => void;

export type ConfigurationEditorProps<
  Control extends WorkspaceItemValueControl,
> = {
  control: Control;
  disabled: boolean;
  onCommit: ConfigurationCommit;
  onEscape: () => void;
};

type ConfigurationInputProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  className: string;
  id: string;
};

export type ConfigurationOption = { label: string; value: string };

export function createConfigurationUpdate(
  control: WorkspaceItemValueControl,
  configuration: WorkspaceItemValueControl["configuration"],
): WorkspaceItemControlConfiguration {
  const update = { kind: control.kind, configuration };
  assertWorkspaceItemControlConfiguration(update, "Inspector configuration");
  return update;
}

export function createConfigurationCommit<
  Control extends WorkspaceItemValueControl,
>(control: Control, onCommit: ConfigurationCommit) {
  return (changes: Partial<Control["configuration"]>) =>
    onCommit(
      createConfigurationUpdate(control, {
        ...control.configuration,
        ...changes,
      }),
    );
}

export function ConfigurationRow({
  children,
  error,
  label,
  name,
}: {
  children: (props: ConfigurationInputProps) => ReactNode;
  error?: string | null;
  label: string;
  name: string;
}) {
  const reactId = useId().replaceAll(":", "");
  const inputId = `setta-inspector-config-${name}-${reactId}`;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="setta-workspace-inspector-config-row">
      <label
        className="setta-workspace-inspector-config-label"
        htmlFor={inputId}
      >
        {label}
      </label>
      {children({
        id: inputId,
        className: "setta-workspace-inspector-config-input",
        "aria-describedby": errorId,
        "aria-invalid": error ? true : undefined,
      })}
      {errorId ? (
        <p className="setta-workspace-inspector-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function handleEscape(
  event: KeyboardEvent<HTMLElement>,
  onEscape: () => void,
  reset?: () => void,
): boolean {
  if (event.key !== "Escape") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  reset?.();
  onEscape();
  return true;
}

export function SelectConfigurationRow({
  disabled,
  label,
  name,
  onChange,
  onEscape,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  onEscape: () => void;
  options: ReadonlyArray<ConfigurationOption>;
  value: string;
}) {
  return (
    <ConfigurationRow label={label} name={name}>
      {(props) => (
        <select
          {...props}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => handleEscape(event, onEscape)}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </ConfigurationRow>
  );
}

export function BooleanConfigurationRow({
  checked,
  disabled,
  label,
  onChange,
  onEscape,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  onEscape: () => void;
}) {
  return (
    <div className="setta-workspace-inspector-config-row">
      <span className="setta-workspace-inspector-config-label">{label}</span>
      <InspectorSwitchControl
        ariaLabel={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        onEscape={onEscape}
      />
    </div>
  );
}

export function ReadOnlyConfigurationRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="setta-workspace-inspector-config-row">
      <span className="setta-workspace-inspector-config-label">{label}</span>
      <span className="setta-workspace-inspector-config-readonly">{value}</span>
    </div>
  );
}

type DraftConfigurationProps<Value> = {
  disabled: boolean;
  label: string;
  name: string;
  onCommit: (value: Value) => void;
  onEscape: () => void;
  validate?: (value: Value) => string | null;
  value: Value;
};

type TextDraftProps = DraftConfigurationProps<string> & {
  placeholder?: string;
  spellCheck?: boolean;
};

type NumberDraftProps = DraftConfigurationProps<number> & {
  max?: number;
  min?: number;
  step?: number | "any";
};

export function DraftTextConfigurationRow(props: TextDraftProps) {
  return <DraftConfigurationRow {...props} type="text" />;
}

export function DraftNumberConfigurationRow(props: NumberDraftProps) {
  return <DraftConfigurationRow {...props} type="number" />;
}

function numberDraftError(
  draft: string,
  value: number,
  label: string,
  validate: NumberDraftProps["validate"],
): string | null {
  return draft.trim() === "" || !Number.isFinite(value)
    ? `${label} must be a finite number.`
    : (validate?.(value) ?? null);
}

function DraftConfigurationRow(
  props:
    | (TextDraftProps & { type: "text" })
    | (NumberDraftProps & { type: "number" }),
) {
  const { disabled, label, name, onEscape } = props;
  const committedValue = String(props.value);
  const [draft, setDraft] = useState(committedValue);
  const [error, setError] = useState<string | null>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    setDraft(committedValue);
    setError(null);
  }, [committedValue]);

  function reset(): void {
    skipBlurRef.current = true;
    setDraft(committedValue);
    setError(null);
    queueMicrotask(() => {
      skipBlurRef.current = false;
    });
  }

  function commit(): void {
    if (props.type === "number") {
      const nextValue = Number(draft);
      const nextError = numberDraftError(
        draft,
        nextValue,
        label,
        props.validate,
      );
      setError(nextError);
      if (nextError) return;
      if (nextValue === props.value) {
        setDraft(committedValue);
      } else {
        props.onCommit(nextValue);
      }
    } else {
      const nextError =
        draft === props.value ? null : (props.validate?.(draft) ?? null);
      setError(nextError);
      if (!nextError && draft !== props.value) props.onCommit(draft);
    }
  }

  const inputProps =
    props.type === "number"
      ? {
          inputMode: "decimal" as const,
          max: props.max,
          min: props.min,
          step: props.step ?? "any",
        }
      : { placeholder: props.placeholder, spellCheck: props.spellCheck };
  return (
    <ConfigurationRow error={error} label={label} name={name}>
      {(fieldProps) => (
        <input
          {...fieldProps}
          {...inputProps}
          disabled={disabled}
          onBlur={() => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false;
              return;
            }
            commit();
          }}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (handleEscape(event, onEscape, reset)) return;
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          type={props.type}
          value={draft}
        />
      )}
    </ConfigurationRow>
  );
}

export function ConfigurationActionButton({
  children,
  disabled,
  label,
  onClick,
  onEscape,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
  onEscape: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="setta-workspace-inspector-config-action"
      disabled={disabled}
      onClick={onClick}
      onKeyDown={(event) => handleEscape(event, onEscape)}
      type="button"
    >
      {children}
    </button>
  );
}
