import { useEffect, useRef, useState } from "react";

export function Editable({ value, onChange, onBlur, onCancel, titleProps }) {
  const [isEditing, setIsEditing] = useState(false);

  function localOnChange(e) {
    onChange(e.target.value);
  }

  function localOnBlur(e) {
    setIsEditing(false);
    onBlur(e.target.value);
  }

  function localOnCancel() {
    setIsEditing(false);
    onCancel();
  }

  function onClick() {
    setIsEditing(true);
  }

  return isEditing ? (
    <InEditMode
      value={value}
      onChange={localOnChange}
      onBlur={localOnBlur}
      onCancel={localOnCancel}
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

function InEditMode({ value, onChange, onBlur, onCancel, titleProps }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus();
    const s = value.length;
    inputRef.current.setSelectionRange(0, s);
  }, []);

  const keyDownHandler = getKeyDownHandler({ onCancel, onBlur });

  return (
    <input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className={titleProps}
      ref={inputRef}
      onKeyDown={keyDownHandler}
      size="1"
    />
  );
}

function InNonEditMode({ value, onClick, titleProps }) {
  return (
    <p onClick={onClick} className={titleProps}>
      {value}
    </p>
  );
}

function getKeyDownHandler({ onCancel, onBlur }) {
  return (event) => {
    if (event.key === "Escape") {
      onCancel();
    } else if (event.key === "Enter") {
      onBlur(event);
    }
  };
}
