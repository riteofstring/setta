import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type {
  SectionChrome,
  WorkspaceActionResult,
  WorkspaceSection,
  WorkspaceSectionPresentation,
} from "../core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";

type SwatchStyle = CSSProperties &
  Readonly<{
    "--setta-workspace-section-swatch": string;
  }>;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="m4.5 10 3.5 3.5 7.5-7.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d="m5.25 5.25 9.5 9.5M14.75 5.25l-9.5 9.5" />
    </svg>
  );
}

function titleActionError(result: WorkspaceActionResult): string | null {
  if (result.status !== "rejected") {
    return null;
  }
  return result.reason === "presentation-edit-disabled"
    ? "Title editing is unavailable."
    : "Unable to save this section title.";
}

const TITLE_VALIDATION_FAILURE = "Unable to validate this section title. Try again.";

function normalizedTitleValidationMessage(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value : TITLE_VALIDATION_FAILURE;
}

async function validateProposedTitle(
  validateTitle: WorkspaceSectionTitleValidator,
  currentTitle: string,
  sectionId: string,
  title: string,
): Promise<string | null> {
  try {
    return normalizedTitleValidationMessage(
      await validateTitle({ currentTitle, sectionId, title }),
    );
  } catch {
    return TITLE_VALIDATION_FAILURE;
  }
}

function showTitleError(
  message: string,
  setError: (message: string) => void,
  inputRef: RefObject<HTMLInputElement | null>,
): void {
  setError(message);
  inputRef.current?.focus({ preventScroll: true });
}

export function SectionTitleEditor({
  currentTitle,
  editorId,
  headingId,
  onCancel,
  onCommit,
  sectionId,
  validateTitle,
}: Readonly<{
  currentTitle: string;
  editorId: string;
  headingId: string;
  onCancel(): void;
  onCommit(sectionId: string, title: string): WorkspaceActionResult;
  sectionId: string;
  validateTitle: WorkspaceSectionTitleValidator;
}>) {
  const errorId = `${editorId}-error`;
  const inputId = `${editorId}-input`;
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const [draft, setDraft] = useState(currentTitle);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const save = async () => {
    const title = draft.trim();
    if (title.length === 0) {
      showTitleError("Enter a section title.", setError, inputRef);
      return;
    }
    setError("");
    setPending(true);
    const validationError = await validateProposedTitle(
      validateTitle,
      currentTitle,
      sectionId,
      title,
    );
    if (!mountedRef.current) {
      return;
    }
    setPending(false);
    if (validationError) {
      showTitleError(validationError, setError, inputRef);
      return;
    }
    const actionError = titleActionError(onCommit(sectionId, title));
    if (actionError) {
      showTitleError(actionError, setError, inputRef);
      return;
    }
    onCancel();
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <div className="setta-workspace__section-title-editor" id={editorId}>
      <h2 className="setta-workspace__visually-hidden" id={headingId}>
        {currentTitle}
      </h2>
      <form
        aria-busy={pending}
        className="setta-workspace__section-title-form"
        data-workspace-local-shortcuts=""
        onSubmit={handleSubmit}
      >
        <label className="setta-workspace__visually-hidden" htmlFor={inputId}>
          Section title
        </label>
        <input
          aria-describedby={errorId}
          aria-invalid={error.length > 0}
          autoComplete="off"
          id={inputId}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          readOnly={pending}
          ref={inputRef}
          spellCheck
          value={draft}
        />
        <button aria-label="Save title" disabled={pending} onKeyDown={handleKeyDown} type="submit">
          <CheckIcon />
        </button>
        <button
          aria-label="Cancel title editing"
          onClick={onCancel}
          onKeyDown={handleKeyDown}
          type="button"
        >
          <CloseIcon />
        </button>
      </form>
      <span aria-live="polite" className="setta-workspace__section-title-message" id={errorId}>
        {pending ? "Checking title…" : error}
      </span>
    </div>
  );
}

function actionAnnouncement(label: string, result: WorkspaceActionResult): string {
  if (result.status === "applied") {
    return `${label} updated.`;
  }
  if (result.status === "unchanged") {
    return `${label} is unchanged.`;
  }
  return "reason" in result && result.reason === "presentation-edit-disabled"
    ? "Section style editing is unavailable."
    : `Unable to update ${label.toLocaleLowerCase()}.`;
}

function ColorPaletteField({
  colorPalette,
  label,
  onChange,
  onPreview,
  onPreviewEnd,
  value,
}: Readonly<{
  colorPalette: readonly WorkspaceSectionColorOption[];
  label: "Accent" | "Tag";
  onChange(value: string | null): void;
  onPreview(value: string | null): void;
  onPreviewEnd(): void;
  value: string | null;
}>) {
  return (
    <fieldset className="setta-workspace__section-color-field">
      <legend>{label}</legend>
      <div className="setta-workspace__section-color-options">
        {colorPalette.map((option) => (
          <button
            aria-label={`Use ${option.label} ${label.toLocaleLowerCase()}`}
            aria-pressed={value === option.color}
            className="setta-workspace__section-color-option"
            key={option.color}
            onBlur={onPreviewEnd}
            onClick={() => onChange(option.color)}
            onFocus={() => onPreview(option.color)}
            onPointerCancel={onPreviewEnd}
            onPointerEnter={() => onPreview(option.color)}
            onPointerLeave={onPreviewEnd}
            style={{ "--setta-workspace-section-swatch": option.color } as SwatchStyle}
            type="button"
          >
            <span aria-hidden="true" className="setta-workspace__section-color-swatch" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <button
        className="setta-workspace__section-color-reset"
        disabled={value === null}
        onBlur={onPreviewEnd}
        onClick={() => onChange(null)}
        onFocus={() => onPreview(null)}
        onPointerCancel={onPreviewEnd}
        onPointerEnter={() => onPreview(null)}
        onPointerLeave={onPreviewEnd}
        type="button"
      >
        Reset {label.toLocaleLowerCase()}
      </button>
    </fieldset>
  );
}

export function SectionPresentationEditor({
  colorPalette,
  editorId,
  onClose,
  onCommit,
  onPreview,
  section,
}: Readonly<{
  colorPalette: readonly WorkspaceSectionColorOption[];
  editorId: string;
  onClose(): void;
  onCommit(sectionId: string, presentation: WorkspaceSectionPresentation): WorkspaceActionResult;
  onPreview(presentation: WorkspaceSectionPresentation | null): void;
  section: WorkspaceSection<unknown>;
}>) {
  const chromeRef = useRef<HTMLSelectElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    chromeRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    editor.addEventListener("keydown", handleKeyDown);
    return () => editor.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const apply = (label: string, update: Partial<WorkspaceSectionPresentation>) => {
    onPreview(null);
    const result = onCommit(section.id, { ...section.presentation, ...update });
    setAnnouncement(actionAnnouncement(label, result));
  };
  const preview = (update: Partial<WorkspaceSectionPresentation>) => {
    onPreview({ ...section.presentation, ...update });
  };

  return (
    <div
      aria-label={`Style ${section.title}`}
      className={`setta-workspace__section-presentation-editor ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-local-shortcuts=""
      id={editorId}
      ref={editorRef}
      role="dialog"
    >
      <div className="setta-workspace__section-presentation-heading">
        <strong>Section style</strong>
        <button aria-label="Close section style" onClick={onClose} type="button">
          <CloseIcon />
        </button>
      </div>
      <label className="setta-workspace__section-chrome-field">
        Chrome
        <select
          onChange={(event) =>
            apply("Chrome", { chrome: event.currentTarget.value as SectionChrome })
          }
          ref={chromeRef}
          value={section.presentation.chrome}
        >
          <option value="default">Default</option>
          <option value="compact">Compact</option>
          <option value="transparent">Transparent</option>
          <option value="none">Headerless</option>
        </select>
      </label>
      <ColorPaletteField
        colorPalette={colorPalette}
        label="Accent"
        onChange={(accentColor) => apply("Accent", { accentColor })}
        onPreview={(accentColor) => preview({ accentColor })}
        onPreviewEnd={() => onPreview(null)}
        value={section.presentation.accentColor}
      />
      <ColorPaletteField
        colorPalette={colorPalette}
        label="Tag"
        onChange={(tagColor) => apply("Tag", { tagColor })}
        onPreview={(tagColor) => preview({ tagColor })}
        onPreviewEnd={() => onPreview(null)}
        value={section.presentation.tagColor}
      />
      <span aria-live="polite" className="setta-workspace__section-presentation-message">
        {announcement}
      </span>
    </div>
  );
}
