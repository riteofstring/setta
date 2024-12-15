import { useEffect, useRef, useState } from "react";

export function Editable({
  value,
  onChange,
  onBlur,
  onKeyDown,
  titleProps,
  doubleClickToEdit = false,
}) {
  const [isEditing, setIsEditing] = useState(false);

  function localOnBlur(e) {
    setIsEditing(false);
    onBlur(e);
  }

  function onClick(e) {
    if (
      e.code === "Space" ||
      (doubleClickToEdit && e.detail === 2) ||
      !doubleClickToEdit
    ) {
      setIsEditing(true);
    } else {
      e.target.blur();
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
    />
  );
}

function InEditMode({ value, onChange, onBlur, onKeyDown, titleProps }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus({ preventScroll: true });
    const s = value.length;
    inputRef.current.setSelectionRange(0, s);
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

function InNonEditMode({ value, onClick, titleProps }) {
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
    >
      {value}
    </p>
  );
}
