import { useEffect, useRef, useState } from "react";

export function Editable({ value, onChange, onBlur, titleProps }) {
  const [isEditing, setIsEditing] = useState(false);

  function localOnChange(e) {
    onChange(e.target.value);
  }

  function localOnBlur(e) {
    setIsEditing(false);
    onBlur(e.target.value);
  }

  function onClick() {
    setIsEditing(true);
  }

  return isEditing ? (
    <InEditMode
      value={value}
      onChange={localOnChange}
      onBlur={localOnBlur}
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

function InEditMode({ value, onChange, onBlur, titleProps }) {
  const inputRef = useRef();

  useEffect(() => {
    inputRef.current.focus();
    const s = value.length;
    inputRef.current.setSelectionRange(s, s);
  }, []);

  return (
    <input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className={titleProps["className"]}
      style={titleProps["style"]}
      ref={inputRef}
    />
  );
}

function InNonEditMode({ value, onClick, titleProps }) {
  return (
    <p
      onClick={onClick}
      className={titleProps["className"]}
      style={titleProps["style"]}
    >
      {value}
    </p>
  );
}
