import { useEffect, useRef, useState } from "react";

export function Editable({ value, onChange, onBlur, onCancel, titleProps }) {
  const [isEditing, setIsEditing] = useState(false);
  useCancelOnEscapeKey({ isEditing, onCancel, setIsEditing });

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
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus();
    const s = value.length;
    inputRef.current.setSelectionRange(0, s);
  }, []);

  return (
    <input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className={titleProps}
      ref={inputRef}
      // size="1"
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

function useCancelOnEscapeKey({ isEditing, onCancel, setIsEditing }) {
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape" && isEditing) {
        onCancel();
        setIsEditing(false);
      }
    };
    window.addEventListener("keydown", handleEsc);

    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isEditing]);
}
