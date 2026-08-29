import type {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from "react";
import { useEffect, useRef, useState } from "react";

// The reference's `components/Utils/Editable.tsx`: a text label that flips to a text input on
// double-click (or keyboard activation), restoring focus to the label after keyboard submit. The
// reference renders the label as a `<p>`; the repository's accessibility gate forbids
// interactive roles on paragraphs, so the package renders a visually identical `<div>`.
type EditableTitleClassNames = {
  editing?: string;
  notEditing?: string;
};

type EditableProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  titleProps: EditableTitleClassNames;
  restoreFocusAfterKeyboardSubmit: RefObject<boolean>;
  // The reference forwards these to both modes so the section title can drive the tooltip.
  onMouseEnter?: (event: { currentTarget: HTMLElement }) => void;
  onMouseLeave?: () => void;
};

export function Editable({
  value,
  onChange,
  onBlur,
  onKeyDown,
  titleProps,
  restoreFocusAfterKeyboardSubmit,
  onMouseEnter,
  onMouseLeave,
}: EditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const paragraphRef = useRef<HTMLDivElement | null>(null);

  function localOnBlur(e: FocusEvent<HTMLInputElement>) {
    // Read before the submission hook resets its escape-specific blur state.
    const focusOnNonEdit = restoreFocusAfterKeyboardSubmit.current;
    setIsEditing(false);
    onBlur(e);
    restoreFocusAfterKeyboardSubmit.current = false;
    if (focusOnNonEdit) {
      requestAnimationFrame(() => {
        paragraphRef.current?.focus({ preventScroll: true });
      });
    }
  }

  function onClick(
    e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) {
    if (
      ("key" in e && (e.key === " " || e.key === "Enter")) ||
      ("detail" in e && e.detail === 2)
    ) {
      setIsEditing(true);
    }
  }

  return isEditing ? (
    <InEditMode
      value={value}
      onChange={onChange}
      onBlur={localOnBlur}
      onKeyDown={onKeyDown}
      ariaLabel="Section title"
      titleProps={titleProps.editing}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  ) : (
    <InNonEditMode
      value={value}
      onClick={onClick}
      titleProps={titleProps.notEditing}
      paragraphRef={paragraphRef}
      ariaLabel={`${value}, edit section title`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

function InEditMode({
  value,
  onChange,
  onBlur,
  onKeyDown,
  titleProps,
  onMouseEnter,
  onMouseLeave,
  ariaLabel,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  titleProps?: string;
  onMouseEnter?: (event: { currentTarget: HTMLElement }) => void;
  onMouseLeave?: () => void;
  ariaLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.focus({ preventScroll: true });
    inputRef.current.setSelectionRange(0, inputRef.current.value.length);
  }, []);

  return (
    <input
      value={value}
      aria-label={ariaLabel}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={titleProps}
      ref={inputRef}
      size={1}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

function InNonEditMode({
  value,
  onClick,
  titleProps,
  paragraphRef,
  onMouseEnter,
  onMouseLeave,
  ariaLabel,
}: {
  value: string;
  onClick: (
    e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
  titleProps?: string;
  paragraphRef: RefObject<HTMLDivElement | null>;
  onMouseEnter?: (event: { currentTarget: HTMLElement }) => void;
  onMouseLeave?: () => void;
  ariaLabel: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault(); // need this to prevent title from getting erased
      onClick(e);
    }
  }

  return (
    <div
      onClick={onClick}
      className={titleProps}
      data-setta-workspace-section-title-display="true"
      role="button"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      ref={paragraphRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {value}
    </div>
  );
}
