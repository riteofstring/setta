import { useEffect, useRef, useState } from "react";

export function Editable({
  value,
  onChange,
  onBlur,
  onKeyDown,
  titleProps,
  onMouseOver,
  onMouseLeave,
  doubleClickToEdit = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const paragraphRef = useRef(null);
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    if (shouldFocusRef.current) {
      paragraphRef.current?.focus({ preventScroll: true });
      shouldFocusRef.current = false;
    }
  });

  function localOnBlur(e) {
    setIsEditing(false);
    onBlur?.(e);
    shouldFocusRef.current = true;
  }

  function onClick(e) {
    if (
      e.code === "Space" ||
      (doubleClickToEdit && e.detail === 2) ||
      !doubleClickToEdit
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
      titleProps={titleProps["editing"]}
    />
  ) : (
    <InNonEditMode
      value={value}
      onClick={onClick}
      titleProps={titleProps["notEditing"]}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
    />
  );
}

function InEditMode({ value, onChange, onBlur, onKeyDown, titleProps }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const s = value.length;
    inputRef.current?.setSelectionRange(0, s);
  }, []);

  return (
    <input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={titleProps}
      ref={inputRef}
      size="1"
    />
  );
}

const InNonEditMode = React.forwardRef(
  ({ value, onClick, titleProps, onMouseOver, onMouseLeave }, ref) => {
    function onKeyDown(e) {
      if (e.code === "Space") {
        e.preventDefault(); // need this to prevent title from getting erased
        onClick(e);
      }
    }

    return (
      <p
        onClick={onClick}
        className={titleProps}
        tabIndex="0"
        onKeyDown={onKeyDown}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        ref={ref}
      >
        {value}
      </p>
    );
  },
);

InNonEditMode.displayName = "InNonEditMode";
