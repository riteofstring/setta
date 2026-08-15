import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
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
export type ConfigurationCommit = (update: WorkspaceItemControlConfiguration) => void;

export type ConfigurationEditorProps<Control extends WorkspaceItemValueControl> = {
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
      <label className="setta-workspace-inspector-config-label" htmlFor={inputId}>
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

export function ReadOnlyConfigurationRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="setta-workspace-inspector-config-row">
      <span className="setta-workspace-inspector-config-label">{label}</span>
      <span className="setta-workspace-inspector-config-readonly">{value}</span>
    </div>
  );
}

export function DraftTextConfigurationRow({
  disabled,
  label,
  name,
  onCommit,
  onEscape,
  placeholder,
  spellCheck,
  validate,
  value,
}: {
  disabled: boolean;
  label: string;
  name: string;
  onCommit: (value: string) => void;
  onEscape: () => void;
  placeholder?: string;
  spellCheck?: boolean;
  validate?: (value: string) => string | null;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  function reset(): void {
    setDraft(value);
    setError(null);
  }

  function commit(): void {
    if (draft === value) {
      setError(null);
      return;
    }
    const nextError = validate?.(draft) ?? null;
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    onCommit(draft);
  }

  return (
    <ConfigurationRow error={error} label={label} name={name}>
      {(props) => (
        <input
          {...props}
          disabled={disabled}
          onBlur={commit}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (handleEscape(event, onEscape, reset)) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          spellCheck={spellCheck}
          type="text"
          value={draft}
        />
      )}
    </ConfigurationRow>
  );
}

export function DraftNumberConfigurationRow({
  disabled,
  label,
  max,
  min,
  name,
  onCommit,
  onEscape,
  step = "any",
  validate,
  value,
}: {
  disabled: boolean;
  label: string;
  max?: number;
  min?: number;
  name: string;
  onCommit: (value: number) => void;
  onEscape: () => void;
  step?: number | "any";
  validate?: (value: number) => string | null;
  value: number;
}) {
  const committedValue = String(value);
  const [draft, setDraft] = useState(committedValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(committedValue);
    setError(null);
  }, [committedValue]);

  function reset(): void {
    setDraft(committedValue);
    setError(null);
  }

  function commit(): void {
    const nextValue = Number(draft);
    const nextError =
      draft.trim() === "" || !Number.isFinite(nextValue)
        ? `${label} must be a finite number.`
        : (validate?.(nextValue) ?? null);
    if (nextError) {
      setError(nextError);
      return;
    }
    if (nextValue === value) {
      setError(null);
      setDraft(committedValue);
      return;
    }
    setError(null);
    onCommit(nextValue);
  }

  return (
    <ConfigurationRow error={error} label={label} name={name}>
      {(props) => (
        <input
          {...props}
          disabled={disabled}
          inputMode="decimal"
          max={max}
          min={min}
          onBlur={commit}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (handleEscape(event, onEscape, reset)) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          step={step}
          type="number"
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
