import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";

type KwargsActionIconButtonProps = {
  ariaLabel: string;
  className: string;
  disabled: boolean;
  iconClassName: string;
  lightweightActivator: boolean;
  onActivate: () => void;
  tooltipContent: string;
};

export function KwargsActionIconButton({
  ariaLabel,
  className,
  disabled,
  iconClassName,
  lightweightActivator,
  onActivate,
  tooltipContent,
}: KwargsActionIconButtonProps) {
  const floatingBoxHandlers = getFloatingBoxHandlers({
    content: tooltipContent,
  });
  const resolvedClassName = `${className} ${disabled ? "pointer-events-none cursor-not-allowed opacity-60" : ""}`.trim();

  if (lightweightActivator) {
    return (
      <div
        {...floatingBoxHandlers}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        className={resolvedClassName}
        data-canvas-owned-lightweight-action-button="true"
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) {
            onActivate();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          if (!disabled) {
            onActivate();
          }
        }}
      >
        <i className={iconClassName} />
      </div>
    );
  }

  return (
    <button
      {...floatingBoxHandlers}
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      type="button"
      onClick={onActivate}
    >
      <i className={iconClassName} />
    </button>
  );
}
