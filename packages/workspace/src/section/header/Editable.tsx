import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

// The reference's `components/Utils/Editable.tsx`: a text label that flips to a text input on
// double-click (or Space), restoring focus to the label after an Escape-triggered blur. The
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
  blurTriggeredByEscapeKey: RefObject<boolean>;
};

export function Editable({
  value,
  onChange,
  onBlur,
  onKeyDown,
  titleProps,
  blurTriggeredByEscapeKey,
}: EditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const paragraphRef = useRef<HTMLDivElement | null>(null);

  function localOnBlur(e: FocusEvent<HTMLInputElement>) {
    // store value in separate variable,
    // because blurTriggeredByEscapeKey gets reset in onBlur
    const focusOnNonEdit = blurTriggeredByEscapeKey.current;
    setIsEditing(false);
    onBlur(e);
    if (focusOnNonEdit) {
      requestAnimationFrame(() => {
        paragraphRef.current?.focus({ preventScroll: true });
      });
    }
  }

  function onClick(e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (("code" in e && e.code === "Space") || ("detail" in e && e.detail === 2)) {
      setIsEditing(true);
    }
  }

  return isEditing ? (
    <InEditMode
      value={value}
      onChange={onChange}
      onBlur={localOnBlur}
      onKeyDown={onKeyDown}
      titleProps={titleProps.editing}
    />
  ) : (
    <InNonEditMode
      value={value}
      onClick={onClick}
      titleProps={titleProps.notEditing}
      paragraphRef={paragraphRef}
    />
  );
}

function InEditMode({
  value,
  onChange,
  onBlur,
  onKeyDown,
  titleProps,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  titleProps?: string;
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
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={titleProps}
      ref={inputRef}
      size={1}
    />
  );
}

function InNonEditMode({
  value,
  onClick,
  titleProps,
  paragraphRef,
}: {
  value: string;
  onClick: (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => void;
  titleProps?: string;
  paragraphRef: RefObject<HTMLDivElement | null>;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.code === "Space") {
      e.preventDefault(); // need this to prevent title from getting erased
      onClick(e);
    }
  }

  return (
    <div
      onClick={onClick}
      className={titleProps}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
      ref={paragraphRef}
    >
      {value}
    </div>
  );
}
