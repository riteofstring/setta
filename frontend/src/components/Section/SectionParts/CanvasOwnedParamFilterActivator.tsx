import { useLayoutEffect, useRef, useState } from "react";

type CanvasOwnedParamFilterActivatorProps = {
  activatorClassName: string;
  id: string;
  inputClassName: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  placeholderClassName: string;
  value: string;
};

export function CanvasOwnedParamFilterActivator({
  activatorClassName,
  id,
  inputClassName,
  onChange,
  placeholder,
  placeholderClassName,
  value,
}: CanvasOwnedParamFilterActivatorProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    if (!editing) {
      return;
    }
    inputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        id={id}
        value={value}
        className={inputClassName}
        placeholder={placeholder}
        tabIndex={0}
        onBlur={() => {
          setEditing(false);
        }}
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.code !== "Escape") {
            return;
          }
          event.currentTarget.blur();
        }}
      />
    );
  }

  const showPlaceholder = value.length === 0;
  const displayValue = showPlaceholder ? placeholder : value;

  return (
    <div
      aria-label="Filter"
      aria-placeholder={placeholder}
      className={`${activatorClassName} ${showPlaceholder ? placeholderClassName : ""}`.trim()}
      data-canvas-owned-lightweight-filter-activator="true"
      data-canvas-owned-resting-text="true"
      id={id}
      role="searchbox"
      tabIndex={0}
      onFocus={() => {
        setEditing(true);
      }}
    >
      {displayValue}
    </div>
  );
}
