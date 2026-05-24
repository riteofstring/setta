import {
  ArtifactTypeEnum,
  DropzoneModeEnum,
  TextParamInputUITypeEnum,
  callOpenAPI,
  createDropzoneFileArtifactId,
  createDropzoneTextAttachmentId,
  deleteArtifacts,
  formatBytes,
  getAttachmentPolicy,
  getCurrentSectionVariantId,
  isAttachmentMimeAllowed,
  parseDropzoneValue,
  res200,
  serializeDropzoneValue,
  setParamEnteredValue,
  type DropzoneStatelessAttachment,
  type DropzoneStoredAttachment,
  updateArtifacts,
  uploadBinary,
} from "@setta/app-subsystem-frontend-sdk";

import React from "react";

import { useAppSubsystemFrontendHost } from "../../../appSubsystemFrontendHostContext";

import { useAppConfigs } from "../../../appSubsystemProjectState";

import { DropzoneInput } from "./dropzoneInput";

export function joinClassNames(
  parts: Array<string | null | undefined | false>,
): string {
  return parts.filter(Boolean).join(" ");
}

export function notifyHost(
  notify: ReturnType<typeof useAppSubsystemFrontendHost>["notify"],
  message: string,
  type: "warning" | "error" = "warning",
): void {
  if (message.trim().length === 0) {
    return;
  }
  notify({ message, type });
}

export function stringifyChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return "";
    })
    .join("");
}

export function normalizeStringArray<T>(
  values: Array<T>,
  limit: number | null,
): Array<T> {
  if (limit === null) {
    return values;
  }
  return values.slice(0, Math.max(limit, 0));
}

export function createLocalId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function resolveRows(value: string): number {
  const lineCount = value.split("\n").length;
  return Math.max(3, Math.min(8, lineCount));
}

export type TextInputCodeMirrorProps = {
  sectionId?: string;
  paramInfoId?: string | null;
  value: string;
  defaultVal?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onMouseDown?: (event: React.MouseEvent<HTMLElement>) => void;
  dummyCodeClassName?: string;
  realCodeClassName?: string;
  singleLine?: boolean;
  wrapLines?: boolean;
  keyComboActions?: Record<string, unknown>;
  onEscape?: (result?: unknown) => void;
  onTab?: () => void;
  color?: string;
  language?: string;
  dummyDivId?: string;
  tooltipParentDivId?: string | null;
  autocomplete?: boolean;
  isKeyName?: boolean;
  isDisabled?: boolean;
};

export function TextInputCodeMirror({
  value,
  defaultVal,
  onChange,
  onBlur,
  onMouseDown,
  dummyCodeClassName,
  realCodeClassName,
  singleLine = false,
  wrapLines = true,
  onEscape,
  isDisabled = false,
}: TextInputCodeMirrorProps) {
  const className = joinClassNames([
    realCodeClassName ?? dummyCodeClassName,
    singleLine ? "min-h-[2rem]" : "min-h-[4.5rem]",
  ]);
  if (singleLine) {
    return (
      <input
        className={className}
        value={value}
        placeholder={defaultVal}
        disabled={isDisabled}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={onBlur}
        onMouseDown={onMouseDown}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onEscape?.();
          }
        }}
      />
    );
  }
  return (
    <textarea
      className={className}
      value={value}
      rows={resolveRows(value)}
      placeholder={defaultVal}
      disabled={isDisabled}
      spellCheck={false}
      wrap={wrapLines ? "soft" : "off"}
      onChange={(event) => onChange?.(event.target.value)}
      onBlur={onBlur}
      onMouseDown={onMouseDown}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onEscape?.();
        }
      }}
    />
  );
}

export type PasswordInputProps = {
  id?: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  isDisabled?: boolean;
  placeholder?: string;
  toggleClassName?: string;
  gridArea?: string;
};

export function PasswordInput({
  id,
  className,
  value,
  onChange,
  onEscape,
  onBlur,
  onKeyDown,
  isDisabled = false,
  placeholder,
  toggleClassName,
  gridArea = "section-value",
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  return (
    <div className={`${gridArea} relative min-w-0`}>
      <input
        id={id}
        className={joinClassNames([className, "pr-14"])}
        value={value}
        disabled={isDisabled}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!onKeyDown && event.key === "Escape") {
            onEscape?.();
          }
        }}
      />
      <button
        type="button"
        className={joinClassNames([
          "absolute inset-y-0 right-1 my-auto h-6 rounded px-2 text-[10px] font-semibold uppercase tracking-wide",
          toggleClassName,
        ])}
        onClick={() => setShowPassword((previous) => !previous)}
        disabled={isDisabled}
        tabIndex={-1}
      >
        {showPassword ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export type SliderInputProps = {
  value: string | number;
  onChange?: (value: number) => void;
  onEscape?: () => void;
  onCommit?: (value: number) => void;
  min: number;
  max: number;
  step: number;
  isDisabled?: boolean;
  wrapperDivClass?: string;
  sliderRootClassName?: string;
  sliderTrackClassName?: string;
  sliderRangeClassName?: string;
  sliderThumbClassName?: string;
  textInputClassName?: string;
};

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SliderInput({
  value,
  onChange,
  onEscape,
  onCommit,
  min,
  max,
  step,
  isDisabled = false,
  wrapperDivClass,
  textInputClassName,
}: SliderInputProps) {
  const numericValue = clampNumber(
    typeof value === "number" ? value : Number.parseFloat(value),
    min,
    max,
  );
  const resolvedValue = Number.isFinite(numericValue) ? numericValue : min;
  const [textValue, setTextValue] = React.useState(String(resolvedValue));

  React.useEffect(() => {
    setTextValue(String(resolvedValue));
  }, [resolvedValue]);

  function commitTextValue(): void {
    const parsed = Number.parseFloat(textValue);
    if (!Number.isFinite(parsed)) {
      setTextValue(String(resolvedValue));
      return;
    }
    const nextValue = clampNumber(parsed, min, max);
    setTextValue(String(nextValue));
    onChange?.(nextValue);
    onCommit?.(nextValue);
  }

  return (
    <div className={joinClassNames([wrapperDivClass, "items-center"])}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={resolvedValue}
        disabled={isDisabled}
        className="h-5 w-full accent-[color:var(--app-accent)]"
        onChange={(event) => {
          const nextValue = Number.parseFloat(event.target.value);
          setTextValue(event.target.value);
          onChange?.(nextValue);
        }}
        onMouseUp={() => onCommit?.(resolvedValue)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onEscape?.();
          }
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={textValue}
        disabled={isDisabled}
        className={textInputClassName}
        onChange={(event) => setTextValue(event.target.value)}
        onBlur={commitTextValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitTextValue();
          }
          if (event.key === "Escape") {
            onEscape?.();
          }
        }}
      />
    </div>
  );
}

export type RotaryInputProps = {
  value: string | number;
  onChange?: (value: number) => void;
  onEscape?: () => void;
  min: number;
  max: number;
  step: number;
  isDisabled?: boolean;
  indicatorThemeClassName?: string;
};

export function RotaryInput({
  value,
  onChange,
  onEscape,
  min,
  max,
  step,
  isDisabled = false,
}: RotaryInputProps) {
  const numericValue = clampNumber(
    typeof value === "number" ? value : Number.parseFloat(value),
    min,
    max,
  );
  const resolvedValue = Number.isFinite(numericValue) ? numericValue : min;
  return (
    <div className="section-value flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={resolvedValue}
        disabled={isDisabled}
        className="h-5 w-24 accent-[color:var(--app-accent)]"
        onChange={(event) => onChange?.(Number.parseFloat(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onEscape?.();
          }
        }}
      />
      <span className="font-mono text-xs text-[color:var(--app-text)]">
        {resolvedValue}
      </span>
    </div>
  );
}

export type DropdownInputProps = {
  choices: Array<string>;
  value: string | null;
  onChange: (value: string) => void;
  outerDivClasses?: string;
  inputOuterClasses?: string;
  comboboxInputThemeClassName?: string;
  comboboxRightButtonThemeClassName?: string;
  comboboxListThemeClassName?: string;
  comboboxGroupHeaderThemeClassName?: string;
  comboboxItemThemeClassName?: string;
  comboboxItemHighlightedThemeClassName?: string;
  isDisabled?: boolean;
  placeholder?: string;
  small?: boolean;
};

export function DropdownInput({
  choices,
  value,
  onChange,
  outerDivClasses,
  inputOuterClasses,
  comboboxInputThemeClassName,
  isDisabled = false,
  placeholder,
}: DropdownInputProps) {
  const normalizedChoices = [...choices];
  if (value && !normalizedChoices.includes(value)) {
    normalizedChoices.unshift(value);
  }
  return (
    <div className={outerDivClasses}>
      <select
        className={joinClassNames([
          "rounded-lg border bg-[color:var(--app-input-bg)] px-2 py-1 font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-input-text)]",
          inputOuterClasses,
          comboboxInputThemeClassName,
        ])}
        value={value ?? ""}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {!value && placeholder ? <option value="">{placeholder}</option> : null}
        {normalizedChoices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </div>
  );
}

export type ColorPickerInputTheme = {
  inputBorderClassName?: string;
  menuContentClassName?: string;
  menuItemClassName?: string;
  menuItemTextClassName?: string;
  triggerBorderClassName?: string;
};

export type ColorPickerInputProps = {
  colorChoices: Array<{ color: string; description: string }>;
  value: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  onEscape?: () => void;
  wrapperClassName: string;
  colorPickerChoicesClasses: string;
  isDisabled?: boolean;
  theme?: ColorPickerInputTheme;
};

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function resolveColorValue(rawValue: string, fallback: string): string {
  if (isHexColor(rawValue)) {
    return rawValue;
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed === "string" && isHexColor(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore parse failures and fall back.
  }
  return fallback;
}

export function ColorPickerInput({
  colorChoices,
  value,
  onChange,
  onCommit,
  onEscape,
  wrapperClassName,
  colorPickerChoicesClasses,
  isDisabled = false,
  theme,
}: ColorPickerInputProps) {
  const fallbackColor = colorChoices[0]?.color ?? "#2563eb";
  const resolvedValue = resolveColorValue(value, fallbackColor);
  return (
    <div className={joinClassNames([wrapperClassName, "gap-2"])}>
      <div className={joinClassNames([colorPickerChoicesClasses, "gap-2"])}>
        <input
          type="color"
          value={resolvedValue}
          disabled={isDisabled}
          className={joinClassNames([
            "h-full min-h-8 w-10 cursor-pointer rounded border bg-transparent p-0",
            theme?.triggerBorderClassName,
          ])}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onCommit?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onEscape?.();
            }
          }}
        />
        {colorChoices.length > 0 ? (
          <select
            className={joinClassNames([
              "min-w-0 flex-1 rounded border bg-[color:var(--app-dropdown-bg)] px-2 py-1 [font-size:var(--app-text-xs)] text-[color:var(--app-dropdown-text)]",
              theme?.inputBorderClassName,
              theme?.menuContentClassName,
              theme?.menuItemClassName,
              theme?.menuItemTextClassName,
            ])}
            value={resolvedValue}
            disabled={isDisabled}
            onChange={(event) => {
              onChange(event.target.value);
              onCommit?.(event.target.value);
            }}
          >
            {colorChoices.map((choice) => (
              <option key={choice.color} value={choice.color}>
                {choice.description || choice.color}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

export type TextParamDateTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  isDisabled?: boolean;
  uiType: string;
  timeControlMode?: string;
  timeDisplayFormat?: string;
  timeDisplayTransparent?: boolean;
  timeDisplayScale?: number;
  timeDisplayFont?: string;
  dateDisplayFormat?: string;
  dateControlMode?: string;
  dateSelectionMode?: string;
  dateCalendarWeekStart?: string;
  dateIncludesTime?: boolean;
  inputClassName?: string;
  formattedValueClassName?: string;
  borderClassName?: string;
};

export function resolveDateInputValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const match = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  return match?.[0] ?? trimmed;
}

export function resolveDateTimeLocalValue(rawValue: string): string {
  const trimmed = rawValue.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  return trimmed;
}

export function resolveTimeInputValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  const match = /^\d{2}:\d{2}/.exec(trimmed);
  return match?.[0] ?? trimmed;
}

export function resolveTemporalInputType(
  props: TextParamDateTimeInputProps,
): "date" | "datetime-local" | "time" | "text" {
  if (props.uiType === TextParamInputUITypeEnum.time) {
    return "time";
  }
  if (props.dateSelectionMode && props.dateSelectionMode !== "single") {
    return "text";
  }
  if (props.dateIncludesTime) {
    return "datetime-local";
  }
  return "date";
}

export function formatTemporalSummary(
  rawValue: string,
  inputType: string,
): string | null {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (inputType === "datetime-local") {
    return trimmed.replace("T", " ");
  }
  return trimmed;
}

export function TextParamDateTimeInput(props: TextParamDateTimeInputProps) {
  const inputType = resolveTemporalInputType(props);
  const summary = formatTemporalSummary(props.value, inputType);
  let inputValue = props.value;
  if (inputType === "date") {
    inputValue = resolveDateInputValue(props.value);
  } else if (inputType === "datetime-local") {
    inputValue = resolveDateTimeLocalValue(props.value);
  } else if (inputType === "time") {
    inputValue = resolveTimeInputValue(props.value);
  }
  return (
    <>
      <div className="section-value flex min-w-0 flex-col gap-1">
        <input
          type={inputType}
          value={inputValue}
          disabled={props.isDisabled}
          className={props.inputClassName}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              props.onEscape?.();
            }
          }}
        />
        {summary ? (
          <span className={props.formattedValueClassName}>{summary}</span>
        ) : null}
      </div>
      {props.borderClassName ? (
        <span className={props.borderClassName} />
      ) : null}
    </>
  );
}

export type CodeBlockProps = React.HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function shouldRenderBlockCode(
  inline: boolean | undefined,
  className: string | undefined,
  codeText: string,
): boolean {
  if (inline === false) {
    return true;
  }
  if (inline === true) {
    return false;
  }
  return (
    /\blanguage-[a-z0-9_+-]+\b/iu.test(className ?? "") ||
    codeText.includes("\n")
  );
}

export function CodeBlock({
  inline,
  className,
  children,
  ...rest
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const codeText = stringifyChildren(children);
  if (!shouldRenderBlockCode(inline, className, codeText)) {
    return (
      <code
        className={joinClassNames([
          "rounded bg-[color:var(--app-surface-alt)] px-1 py-[1px] font-mono text-[0.92em]",
          className,
        ])}
        {...rest}
      >
        {children}
      </code>
    );
  }
  return (
    <pre
      className="group relative overflow-x-auto rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface-alt)] p-3"
      {...rest}
    >
      <code className={joinClassNames(["font-mono text-sm", className])}>
        {codeText}
      </code>
      <button
        type="button"
        className="absolute right-2 top-2 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--app-muted)] opacity-0 transition-opacity group-hover:opacity-100"
        onClick={async () => {
          if (typeof navigator === "undefined" || !navigator.clipboard) {
            return;
          }
          await navigator.clipboard.writeText(codeText);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </pre>
  );
}

export type DropzoneInputTheme = {
  wrapperBaseClassName?: string;
  dragActiveClassName?: string;
  controlsRowClassName?: string;
  controlButtonClassName?: string;
  uploadingTextClassName?: string;
  attachmentsContainerClassName?: string;
  attachmentSizeTextClassName?: string;
  deleteButtonClassName?: string;
};

export type DropzoneInputProps = {
  configId?: string;
  sectionId?: string;
  paramInfoId?: string;
  value: string;
  onChange?: (
    value: string,
    options?: {
      skipBackendUpdate?: boolean;
    },
  ) => void;
  onStatelessDrop?: (attachments: DropzoneStatelessAttachment[]) => void;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  mode?: string;
  maxAttachments?: number | null;
  theme?: DropzoneInputTheme;
};

export type DisplayAttachment = {
  id: string | null;
  kind: "file" | "text";
  name: string;
  size: number | null;
  text?: string;
};

export function resolveTextAttachmentName(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length === 0) {
    return "Dropped text";
  }
  if (singleLine.length <= 24) {
    return singleLine;
  }
  return `${singleLine.slice(0, 21)}...`;
}

export function resolveRemainingSlots(
  maxAttachments: number | null | undefined,
  attachmentCount: number,
): number | null {
  if (!Number.isFinite(maxAttachments)) {
    return null;
  }
  if ((maxAttachments ?? 0) < 0) {
    return null;
  }
  return Math.max((maxAttachments ?? 0) - attachmentCount, 0);
}

export function resolveDropzoneTheme(
  theme: DropzoneInputTheme | undefined,
): Required<DropzoneInputTheme> {
  return {
    wrapperBaseClassName:
      theme?.wrapperBaseClassName ??
      "flex h-full w-full flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3 text-center [font-size:var(--app-text-xs)] font-bold uppercase tracking-widest text-[color:var(--app-muted)]",
    dragActiveClassName:
      theme?.dragActiveClassName ??
      "border-[color:var(--app-accent)] bg-[color:var(--app-surface-alt)] text-[color:var(--app-text)]",
    controlsRowClassName:
      theme?.controlsRowClassName ??
      "flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--app-muted)]",
    controlButtonClassName:
      theme?.controlButtonClassName ??
      "rounded-full border border-[color:var(--app-border)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[color:var(--app-muted)] disabled:cursor-not-allowed disabled:opacity-50",
    uploadingTextClassName:
      theme?.uploadingTextClassName ??
      "text-[10px] font-semibold uppercase tracking-widest text-[color:var(--app-muted)]",
    attachmentsContainerClassName:
      theme?.attachmentsContainerClassName ??
      "flex flex-col gap-2 rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-2 text-[11px] text-[color:var(--app-text)]",
    attachmentSizeTextClassName:
      theme?.attachmentSizeTextClassName ??
      "text-[10px] uppercase tracking-wide text-[color:var(--app-muted)]",
    deleteButtonClassName:
      theme?.deleteButtonClassName ??
      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--app-muted)]",
  };
}

export function summarizeRejectedFiles(files: File[], noun: string): string {
  const sample = files
    .slice(0, 3)
    .map((file) => file.name)
    .join(", ");
  const suffix = files.length > 3 ? ` +${files.length - 3} more` : "";
  return `${noun}: ${sample}${suffix}.`;
}

export async function readFileBuffers(
  files: File[],
): Promise<Array<{ buffer: ArrayBuffer; contentId: string; file: File }>> {
  const uploads = await Promise.allSettled(
    files.map(async (file) => ({
      file,
      buffer: await file.arrayBuffer(),
      contentId: createLocalId("content-"),
    })),
  );
  return uploads.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }
    return [];
  });
}

export async function deleteAttachmentArtifact(
  artifactId: string,
  notify: ReturnType<typeof useAppSubsystemFrontendHost>["notify"],
): Promise<void> {
  const response = await callOpenAPI(
    deleteArtifacts({
      body: {
        artifacts: [{ id: artifactId, type: ArtifactTypeEnum.File }],
      },
    } as Parameters<typeof deleteArtifacts>[0]),
  );
  if (!res200(response)) {
    notifyHost(notify, "Failed to delete attachment.");
  }
}
