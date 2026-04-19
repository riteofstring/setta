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
import { useAppSubsystemFrontendHost } from "../../appSubsystemFrontendHostContext";
import { useAppConfigs } from "../../appSubsystemProjectState";

function joinClassNames(
  parts: Array<string | null | undefined | false>,
): string {
  return parts.filter(Boolean).join(" ");
}

function notifyHost(
  notify: ReturnType<typeof useAppSubsystemFrontendHost>["notify"],
  message: string,
  type: "warning" | "error" = "warning",
): void {
  if (message.trim().length === 0) {
    return;
  }
  notify({ message, type });
}

function stringifyChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return "";
    })
    .join("");
}

function normalizeStringArray<T>(
  values: Array<T>,
  limit: number | null,
): Array<T> {
  if (limit === null) {
    return values;
  }
  return values.slice(0, Math.max(limit, 0));
}

function createLocalId(prefix: string): string {
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

function resolveRows(value: string): number {
  const lineCount = value.split("\n").length;
  return Math.max(3, Math.min(8, lineCount));
}

type TextInputCodeMirrorProps = {
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

type PasswordInputProps = {
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

type SliderInputProps = {
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

function clampNumber(value: number, min: number, max: number): number {
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

type RotaryInputProps = {
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

type DropdownInputProps = {
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

type ColorPickerInputTheme = {
  menuContentClassName?: string;
  menuItemClassName?: string;
  menuItemTextClassName?: string;
};

type ColorPickerInputProps = {
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

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function resolveColorValue(rawValue: string, fallback: string): string {
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
          className="h-full min-h-8 w-10 cursor-pointer rounded border bg-transparent p-0"
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

type TextParamDateTimeInputProps = {
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

function resolveDateInputValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const match = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
  return match?.[0] ?? trimmed;
}

function resolveDateTimeLocalValue(rawValue: string): string {
  const trimmed = rawValue.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  return trimmed;
}

function resolveTimeInputValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  const match = /^\d{2}:\d{2}/.exec(trimmed);
  return match?.[0] ?? trimmed;
}

function resolveTemporalInputType(
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

function formatTemporalSummary(
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

type CodeBlockProps = React.HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function shouldRenderBlockCode(
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

type DropzoneInputTheme = {
  wrapperBaseClassName?: string;
  dragActiveClassName?: string;
  controlsRowClassName?: string;
  controlButtonClassName?: string;
  uploadingTextClassName?: string;
  attachmentsContainerClassName?: string;
  attachmentSizeTextClassName?: string;
  deleteButtonClassName?: string;
};

type DropzoneInputProps = {
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

type DisplayAttachment = {
  id: string | null;
  kind: "file" | "text";
  name: string;
  size: number | null;
  text?: string;
};

function resolveTextAttachmentName(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length === 0) {
    return "Dropped text";
  }
  if (singleLine.length <= 24) {
    return singleLine;
  }
  return `${singleLine.slice(0, 21)}...`;
}

function resolveRemainingSlots(
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

function resolveDropzoneTheme(
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

function summarizeRejectedFiles(files: File[], noun: string): string {
  const sample = files
    .slice(0, 3)
    .map((file) => file.name)
    .join(", ");
  const suffix = files.length > 3 ? ` +${files.length - 3} more` : "";
  return `${noun}: ${sample}${suffix}.`;
}

async function readFileBuffers(
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

async function deleteAttachmentArtifact(
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

export function DropzoneInput({
  configId,
  sectionId,
  paramInfoId,
  value,
  onChange,
  onStatelessDrop,
  placeholder,
  className,
  isDisabled = false,
  mode = DropzoneModeEnum.STATEFUL,
  maxAttachments = null,
  theme,
}: DropzoneInputProps) {
  const frontendHost = useAppSubsystemFrontendHost();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [statelessAttachments, setStatelessAttachments] = React.useState<
    DisplayAttachment[]
  >([]);

  const parsedStatefulValue =
    mode === DropzoneModeEnum.STATEFUL ? parseDropzoneValue(value) : null;
  const statefulAttachments = parsedStatefulValue?.attachments ?? [];
  const invalidStatefulValue =
    mode === DropzoneModeEnum.STATEFUL &&
    value.trim().length > 0 &&
    parsedStatefulValue === null;
  const attachmentPolicy = getAttachmentPolicy(
    mode === DropzoneModeEnum.STATELESS
      ? "dropzone_stateless"
      : "dropzone_stateful",
  );
  const displayAttachments =
    mode === DropzoneModeEnum.STATELESS
      ? statelessAttachments
      : statefulAttachments.map((attachment) => ({
          id: attachment.id,
          kind: attachment.kind,
          name: attachment.name,
          size: attachment.kind === "file" ? attachment.size ?? null : null,
          text: attachment.kind === "text" ? attachment.text : undefined,
        }));
  const remainingSlots = resolveRemainingSlots(
    maxAttachments,
    displayAttachments.length,
  );
  const resolvedTheme = resolveDropzoneTheme(theme);
  const sectionVariantId = useAppConfigs((state) => {
    if (!configId || !sectionId) {
      return null;
    }
    const configState = state.configs[configId];
    if (!configState) {
      return null;
    }
    return getCurrentSectionVariantId(configState, sectionId);
  });

  async function commitStatefulValue(
    nextValue: string,
    previousValue: string,
    uploadedArtifactIds: string[] = [],
  ): Promise<boolean> {
    if (!onChange) {
      return false;
    }
    if (!configId || !sectionId || !paramInfoId || !sectionVariantId) {
      onChange(nextValue);
      return true;
    }
    onChange(nextValue, { skipBackendUpdate: true });
    const response = await callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: configId,
          sectionId,
          sectionVariantId,
          paramInfoId,
          value: nextValue,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    );
    if (res200(response)) {
      return true;
    }
    notifyHost(frontendHost.notify, "Failed to update attachments.");
    if (uploadedArtifactIds.length > 0) {
      await callOpenAPI(
        deleteArtifacts({
          body: {
            artifacts: uploadedArtifactIds.map((artifactId) => ({
              id: artifactId,
              type: ArtifactTypeEnum.File,
            })),
          },
        } as Parameters<typeof deleteArtifacts>[0]),
      );
    }
    onChange(previousValue, { skipBackendUpdate: true });
    return false;
  }

  async function handleStatefulFiles(files: File[]): Promise<void> {
    if (!onChange) {
      return;
    }
    const uploads = await Promise.allSettled(
      files.map(async (file) => {
        const response = await callOpenAPI(
          uploadBinary({
            body: {
              durable: false,
              file,
            },
          } as Parameters<typeof uploadBinary>[0]),
        );
        if (!res200(response) || !response.data) {
          throw new Error(`Upload failed for ${file.name}`);
        }
        return { file, ref: response.data };
      }),
    );
    const successfulUploads = uploads.flatMap((result) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }
      return [];
    });
    const failedFiles = uploads.flatMap((result, index) => {
      if (result.status === "rejected") {
        return [files[index]];
      }
      return [];
    });
    if (failedFiles.length > 0) {
      notifyHost(
        frontendHost.notify,
        `Failed to upload some files. ${summarizeRejectedFiles(
          failedFiles,
          "Skipped",
        )}`,
      );
    }
    if (successfulUploads.length === 0) {
      return;
    }
    const artifactIds = successfulUploads.map(({ file }) =>
      createDropzoneFileArtifactId(file.name),
    );
    const artifacts = successfulUploads.map(({ ref }, index) => ({
      type: ArtifactTypeEnum.File,
      id: artifactIds[index],
      value: ref,
    }));
    const artifactResponse = await callOpenAPI(
      updateArtifacts({
        body: {
          artifacts,
          uploadScope: "generic",
        },
      } as Parameters<typeof updateArtifacts>[0]),
    );
    if (!res200(artifactResponse)) {
      notifyHost(
        frontendHost.notify,
        "Failed to register uploaded attachments.",
      );
      return;
    }
    const nextAttachments: DropzoneStoredAttachment[] = [
      ...statefulAttachments,
      ...successfulUploads.map(({ file }, index) => ({
        kind: "file" as const,
        id: artifactIds[index],
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      })),
    ];
    await commitStatefulValue(
      serializeDropzoneValue(nextAttachments),
      value,
      artifactIds,
    );
  }

  async function handleStatelessFiles(files: File[]): Promise<void> {
    const successfulReads = await readFileBuffers(files);
    const failedCount = files.length - successfulReads.length;
    if (failedCount > 0) {
      notifyHost(frontendHost.notify, "Failed to read some dropped files.");
    }
    if (successfulReads.length === 0) {
      return;
    }
    const allowedReads: Array<(typeof successfulReads)[number]> = [];
    let runningTotal = 0;
    for (const read of successfulReads) {
      const nextTotal = runningTotal + read.buffer.byteLength;
      if (
        attachmentPolicy.maxTotalBytes !== null &&
        nextTotal > attachmentPolicy.maxTotalBytes
      ) {
        notifyHost(
          frontendHost.notify,
          `Skipped some files to stay under ${attachmentPolicy.maxTotalLabel}.`,
        );
        continue;
      }
      runningTotal = nextTotal;
      allowedReads.push(read);
    }
    if (allowedReads.length === 0) {
      return;
    }
    const attachments: DropzoneStatelessAttachment[] = allowedReads.map(
      ({ buffer, contentId, file }) => ({
        kind: "file",
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentId,
        byteLength: buffer.byteLength,
        binaryPayload: buffer,
      }),
    );
    setStatelessAttachments((previous) =>
      normalizeStringArray(
        [
          ...previous,
          ...allowedReads.map(({ file }) => ({
            id: null,
            kind: "file" as const,
            name: file.name,
            size: file.size,
          })),
        ],
        maxAttachments,
      ),
    );
    onStatelessDrop?.(attachments);
  }

  async function handleTextDrop(text: string): Promise<void> {
    const normalizedText = text.trim();
    if (normalizedText.length === 0) {
      return;
    }
    if (mode === DropzoneModeEnum.STATELESS) {
      const attachment: DropzoneStatelessAttachment = {
        kind: "text",
        name: resolveTextAttachmentName(normalizedText),
        text: normalizedText,
      };
      setStatelessAttachments((previous) =>
        normalizeStringArray(
          [
            ...previous,
            {
              id: null,
              kind: "text",
              name: attachment.name,
              size: null,
              text: attachment.text,
            },
          ],
          maxAttachments,
        ),
      );
      onStatelessDrop?.([attachment]);
      return;
    }
    if (!onChange) {
      return;
    }
    const nextAttachments: DropzoneStoredAttachment[] = [
      ...statefulAttachments,
      {
        kind: "text",
        id: createDropzoneTextAttachmentId(),
        name: resolveTextAttachmentName(normalizedText),
        text: normalizedText,
      },
    ];
    await commitStatefulValue(serializeDropzoneValue(nextAttachments), value);
  }

  async function handleFiles(files: File[]): Promise<void> {
    if (isDisabled || isUploading) {
      return;
    }
    if (invalidStatefulValue) {
      notifyHost(
        frontendHost.notify,
        "Dropzone value is invalid JSON. Clear it before adding attachments.",
      );
      return;
    }
    const limitedFiles =
      remainingSlots === null ? files : files.slice(0, remainingSlots);
    const oversizedFiles = limitedFiles.filter(
      (file) => file.size > attachmentPolicy.maxFileBytes,
    );
    if (oversizedFiles.length > 0) {
      notifyHost(
        frontendHost.notify,
        `Skipped oversized files over ${attachmentPolicy.maxFileLabel}.`,
      );
    }
    const allowedBySize = limitedFiles.filter(
      (file) => file.size <= attachmentPolicy.maxFileBytes,
    );
    const disallowedMimeFiles = allowedBySize.filter(
      (file) => !isAttachmentMimeAllowed(file.type || "", attachmentPolicy),
    );
    if (disallowedMimeFiles.length > 0 && attachmentPolicy.allowedMimeLabel) {
      notifyHost(frontendHost.notify, attachmentPolicy.allowedMimeLabel);
    }
    const allowedFiles = allowedBySize.filter((file) =>
      isAttachmentMimeAllowed(file.type || "", attachmentPolicy),
    );
    if (allowedFiles.length === 0) {
      return;
    }
    setIsUploading(true);
    try {
      if (mode === DropzoneModeEnum.STATELESS) {
        await handleStatelessFiles(allowedFiles);
      } else {
        await handleStatefulFiles(allowedFiles);
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function removeAttachment(
    attachment: DisplayAttachment,
  ): Promise<void> {
    if (mode === DropzoneModeEnum.STATELESS) {
      setStatelessAttachments((previous) =>
        previous.filter((item) => item.name !== attachment.name),
      );
      return;
    }
    const nextAttachments = statefulAttachments.filter(
      (item) => item.id !== attachment.id,
    );
    const committed = await commitStatefulValue(
      serializeDropzoneValue(nextAttachments),
      value,
    );
    if (committed && attachment.kind === "file" && attachment.id) {
      await deleteAttachmentArtifact(attachment.id, frontendHost.notify);
    }
  }

  return (
    <div className={joinClassNames([className, "flex flex-col gap-3"])}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files
            ? Array.from(event.target.files)
            : [];
          event.target.value = "";
          void handleFiles(files);
        }}
      />
      <div
        className={joinClassNames([
          resolvedTheme.wrapperBaseClassName,
          isDragActive && resolvedTheme.dragActiveClassName,
        ])}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setIsDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (files.length > 0) {
            void handleFiles(files);
            return;
          }
          const droppedText =
            event.dataTransfer.getData("text/plain") ||
            event.dataTransfer.getData("text");
          if (droppedText.trim().length > 0) {
            void handleTextDrop(droppedText);
          }
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <span>{placeholder ?? "Drop files or text here."}</span>
          <div className={resolvedTheme.controlsRowClassName}>
            <button
              type="button"
              className={resolvedTheme.controlButtonClassName}
              disabled={isDisabled || isUploading || remainingSlots === 0}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Files
            </button>
            {isUploading ? (
              <span className={resolvedTheme.uploadingTextClassName}>
                Uploading...
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {invalidStatefulValue ? (
        <div className="text-[11px] text-[color:var(--app-muted)]">
          Existing attachment data is invalid. Clear the param value before
          uploading more files.
        </div>
      ) : null}
      {displayAttachments.length > 0 ? (
        <div className={resolvedTheme.attachmentsContainerClassName}>
          {displayAttachments.map((attachment) => (
            <div
              key={attachment.id ?? `${attachment.kind}:${attachment.name}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{attachment.name}</div>
                {attachment.size !== null ? (
                  <div className={resolvedTheme.attachmentSizeTextClassName}>
                    {formatBytes(attachment.size)}
                  </div>
                ) : null}
                {attachment.text ? (
                  <div className="line-clamp-2 text-[10px] text-[color:var(--app-muted)]">
                    {attachment.text}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={resolvedTheme.deleteButtonClassName}
                onClick={() => {
                  void removeAttachment(attachment);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
