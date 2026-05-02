import { useState } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

function joinGpuControlClassNames(...classNames: Array<string | undefined>) {
  return [NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME, ...classNames]
    .filter(Boolean)
    .join(" ");
}

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
    <div className={joinGpuControlClassNames(`${gridArea} relative min-w-0`)}>
      <input
        id={id}
        className={joinGpuControlClassNames(className, "pr-8")}
        data-gpu-flow-interactive="true"
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
        className={joinGpuControlClassNames(
          "absolute inset-y-0 right-0 grid w-8 cursor-pointer place-items-center text-setta-400 hover:text-setta-600 dark:text-setta-500 dark:hover:text-setta-300",
          toggleClassName,
        )}
        data-gpu-flow-interactive="true"
        tabIndex={-1}
      >
        {!showPassword ? <BiHide /> : <BiShow />}
      </button>
    </div>
  );
}
