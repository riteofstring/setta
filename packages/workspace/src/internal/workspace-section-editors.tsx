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
  const currentTitleRef = useRef(currentTitle);
  const onCancelRef = useRef(onCancel);
  currentTitleRef.current = currentTitle;
  onCancelRef.current = onCancel;
  const [draft, setDraft] = useState(currentTitle);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [proposedTitle, setProposedTitle] = useState<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (proposedTitle === null) {
      return;
    }
    const timeout = globalThis.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }
      const canonicalTitle = currentTitleRef.current;
      if (canonicalTitle === proposedTitle) {
        onCancelRef.current();
        return;
      }
      setProposedTitle(null);
      showTitleError(
        `${canonicalTitle} remains the section title because the host did not accept the change.`,
        setError,
        inputRef,
      );
    }, 0);
    return () => globalThis.clearTimeout(timeout);
  }, [proposedTitle]);

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
    const result = onCommit(sectionId, title);
    const actionError = titleActionError(result);
    if (actionError) {
      showTitleError(actionError, setError, inputRef);
      return;
    }
    if (result.status === "applied") {
      setProposedTitle(title);
    } else {
      onCancel();
    }
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
        aria-busy={pending || proposedTitle !== null}
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
          readOnly={pending || proposedTitle !== null}
          ref={inputRef}
          spellCheck
          value={draft}
        />
        <button
          aria-label="Save title"
          disabled={pending || proposedTitle !== null}
          onKeyDown={handleKeyDown}
          type="submit"
        >
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
        {pending ? "Checking title…" : proposedTitle === null ? error : "Saving title…"}
      </span>
    </div>
  );
}

function actionAnnouncement(
  label: string,
  result: Exclude<WorkspaceActionResult, { status: "applied" }>,
): string {
  if (result.status === "unchanged") {
    return `${label} is unchanged.`;
  }
  return "reason" in result && result.reason === "presentation-edit-disabled"
    ? "Section style editing is unavailable."
    : `Unable to update ${label.toLocaleLowerCase()}.`;
}

type PendingPresentationCommit = Readonly<{
  label: string;
  update: Partial<WorkspaceSectionPresentation>;
}>;

function presentationUpdateMatches(
  presentation: WorkspaceSectionPresentation,
  update: Partial<WorkspaceSectionPresentation>,
): boolean {
  return Object.entries(update).every(
    ([property, value]) => presentation[property as keyof WorkspaceSectionPresentation] === value,
  );
}

function ColorPaletteField({
  colorPalette,
  disabled,
  label,
  onChange,
  onPreview,
  onPreviewEnd,
  value,
}: Readonly<{
  colorPalette: readonly WorkspaceSectionColorOption[];
  disabled: boolean;
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
            disabled={disabled}
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
        disabled={disabled || value === null}
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
  const presentationRef = useRef(section.presentation);
  presentationRef.current = section.presentation;
  const [announcement, setAnnouncement] = useState("");
  const [pendingCommit, setPendingCommit] = useState<PendingPresentationCommit | null>(null);
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
  useEffect(() => {
    if (!pendingCommit) {
      return;
    }
    const timeout = globalThis.setTimeout(() => {
      setAnnouncement(
        presentationUpdateMatches(presentationRef.current, pendingCommit.update)
          ? `${pendingCommit.label} updated.`
          : `${pendingCommit.label} remains unchanged because the host did not accept the change.`,
      );
      setPendingCommit(null);
    }, 0);
    return () => globalThis.clearTimeout(timeout);
  }, [pendingCommit]);
  const apply = (label: string, update: Partial<WorkspaceSectionPresentation>) => {
    onPreview(null);
    const presentation = { ...section.presentation, ...update };
    const result = onCommit(section.id, presentation);
    if (result.status === "applied") {
      setAnnouncement("");
      setPendingCommit({ label, update });
    } else {
      setPendingCommit(null);
      setAnnouncement(actionAnnouncement(label, result));
    }
  };
  const preview = (update: Partial<WorkspaceSectionPresentation>) => {
    onPreview({ ...section.presentation, ...update });
  };

  return (
    <div
      aria-label={`Style ${section.title}`}
      aria-busy={pendingCommit !== null}
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
          disabled={pendingCommit !== null}
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
        disabled={pendingCommit !== null}
        label="Accent"
        onChange={(accentColor) => apply("Accent", { accentColor })}
        onPreview={(accentColor) => preview({ accentColor })}
        onPreviewEnd={() => onPreview(null)}
        value={section.presentation.accentColor}
      />
      <ColorPaletteField
        colorPalette={colorPalette}
        disabled={pendingCommit !== null}
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
