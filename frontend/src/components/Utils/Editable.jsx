import React, { useEffect, useRef, useState } from "react";

function useFocusManagement(isEditing) {
  const elementRef = useRef(null);

  function focusNextElement() {
    const focusableElements =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const elements = document.querySelectorAll(focusableElements);
    const currentIndex = Array.from(elements).indexOf(elementRef.current);
    const nextElement = elements[currentIndex + 1];

    if (nextElement) {
      nextElement.focus();
    }
  }

  return { elementRef, focusNextElement };
}

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
  const { elementRef, focusNextElement } = useFocusManagement(isEditing);

  function localOnBlur(e) {
    setIsEditing(false);
    onBlur(e);
    focusNextElement();
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
      ref={elementRef}
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

const InNonEditMode = React.forwardRef(
  ({ value, onClick, titleProps, onMouseOver, onMouseLeave }, ref) => {
    function onKeyDown(e) {
      if (e.code === "Space") {
        e.preventDefault();
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
