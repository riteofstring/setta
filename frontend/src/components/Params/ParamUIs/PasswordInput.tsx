import { useState } from "react";
import { BiHide, BiShow } from "react-icons/bi";

export function PasswordInput({
  id,
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
    <div className={`${gridArea} relative min-w-0`}>
      <input
        id={id}
        className={`${className} pr-8`}
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
        aria-label={showPassword ? "Hide password" : "Show password"}
        className={`absolute inset-y-0 right-0 grid w-8 place-items-center cursor-pointer text-setta-400 hover:text-setta-600 dark:text-setta-500 dark:hover:text-setta-300 ${toggleClassName ?? ""}`}
        tabIndex={-1}
      >
        {!showPassword ? <BiHide /> : <BiShow />}
      </button>
    </div>
  );
}
