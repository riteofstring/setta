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
  const inputRef = useRef(null);
  const paragraphRef = useRef(null);

  const handleContainerClick = (e) => {
    if (
      !isEditing &&
      (e.code === "Space" ||
        (doubleClickToEdit && e.detail === 2) ||
        !doubleClickToEdit)
    ) {
      setIsEditing(true);
    }
  };

  const handleKeyDown = (e) => {
    if (!isEditing && e.code === "Space") {
      e.preventDefault();
      setIsEditing(true);
    } else if (isEditing) {
      onKeyDown?.(e);
    }
  };

  const handleBlur = (e) => {
    if (isEditing) {
      setIsEditing(false);
      onBlur?.(e);
      paragraphRef.current?.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.setSelectionRange(0, value.length);
    }
  }, [isEditing, value]);

  return (
    <div className="relative">
      <p
        ref={paragraphRef}
        onClick={handleContainerClick}
        onKeyDown={handleKeyDown}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        tabIndex="0"
        className={`
            ${titleProps?.notEditing || ""} 
            ${isEditing ? "opacity-0" : "opacity-100"}
            transition-opacity duration-75
          `}
        role="button"
        aria-label={isEditing ? "Edit text" : "Click to edit text"}
      >
        {value}
      </p>

      {isEditing && (
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`
            ${titleProps?.editing || ""} 
            absolute left-0 top-0 
            -translate-y-[1px]
          `}
          size="1"
        />
      )}
    </div>
  );
}
