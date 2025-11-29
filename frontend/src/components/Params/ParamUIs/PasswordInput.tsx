import { useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { BiHide, BiShow } from "react-icons/bi";

type PasswordInputProps = {
  className: string;
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  isDisabled: boolean;
  gridArea?: string;
  placeholder?: string;
};

export function PasswordInput({
  className,
  value,
  onChange,
  onEscape,
  onBlur,
  onKeyDown,
  isDisabled,
  gridArea = "section-value",
  placeholder,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };
  return (
    <>
      <input
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
        type={showPassword ? "text" : "password"}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (onKeyDown) {
            onKeyDown(e);
          } else if (e.code === "Escape") {
            onEscape?.();
          }
        }}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={togglePasswordVisibility}
        className={`${gridArea} grid-row-start-1 cursor-pointer justify-self-end text-setta-400 hover:text-setta-600 dark:text-setta-500 dark:hover:text-setta-300`}
        tabIndex={-1}
      >
        {!showPassword ? <BiHide /> : <BiShow />}
      </button>
    </>
  );
}
