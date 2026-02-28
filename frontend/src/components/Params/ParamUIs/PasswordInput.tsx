import { useState } from "react";
import { BiHide, BiShow } from "react-icons/bi";

export function PasswordInput({
  className,
  value,
  onChange,
  onEscape,
  onBlur,
  onKeyDown,
  isDisabled,
  placeholder,
  toggleClassName,
  gridArea = "section-value",
}) {
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
        placeholder={placeholder}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (onKeyDown) {
            onKeyDown(e);
          } else if (e.code === "Escape") {
            onEscape?.();
          }
        }}
      />
      <button
        type="button"
        onClick={togglePasswordVisibility}
        className={`${gridArea} grid-row-start-1 cursor-pointer justify-self-end text-setta-400 hover:text-setta-600 dark:text-setta-500 dark:hover:text-setta-300 ${toggleClassName ?? ""}`}
        tabIndex={-1}
      >
        {!showPassword ? <BiHide /> : <BiShow />}
      </button>
    </>
  );
}
