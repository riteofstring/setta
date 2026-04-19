import * as Switch from "@radix-ui/react-switch";

type SwitchInputProps = {
  canvasOwnedTrack?: boolean;
  lightweightActivator?: boolean;
  lightweightRootClassName?: string;
  value: boolean | string;
  defaultVal?: boolean | string;
  onChange: (value: boolean) => void;
  onEscape?: () => void;
  isDisabled?: boolean;
  outerDivClassName?: string;
  rootThemeClassName?: string;
  thumbThemeClassName?: string;
};

const CANVAS_OWNED_TRANSPARENT_SWITCH_ROOT_THEME =
  "bg-transparent data-[state='checked']:bg-transparent dark:bg-transparent dark:data-[state='checked']:bg-transparent";
const CANVAS_OWNED_TRANSPARENT_SWITCH_THUMB_THEME =
  "bg-transparent dark:bg-transparent";

export function SwitchInput({
  canvasOwnedTrack,
  lightweightActivator,
  lightweightRootClassName,
  value,
  onChange,
  onEscape,
  isDisabled,
  outerDivClassName,
  rootThemeClassName,
  thumbThemeClassName,
}: SwitchInputProps) {
  const rootBaseClassName =
    "nodrag relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none";
  const rootResolvedThemeClassName =
    rootThemeClassName ??
    (canvasOwnedTrack
      ? CANVAS_OWNED_TRANSPARENT_SWITCH_ROOT_THEME
      : "bg-setta-400 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700");
  const thumbBaseClassName =
    "block h-2.5 w-2.5 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4";
  const thumbResolvedThemeClassName =
    thumbThemeClassName ??
    (canvasOwnedTrack
      ? CANVAS_OWNED_TRANSPARENT_SWITCH_THUMB_THEME
      : "bg-white dark:bg-setta-800");
  const checked = value === true || value === "true";
  const switchState = checked ? "checked" : "unchecked";
  const rootClassName =
    `${rootBaseClassName} ${rootResolvedThemeClassName} ${isDisabled ? "pointer-events-none" : ""}`.trim();
  const outerClassName =
    canvasOwnedTrack && outerDivClassName
      ? `${outerDivClassName} opacity-0`
      : outerDivClassName;

  if (lightweightActivator) {
    const toggleValue = () => {
      if (isDisabled) {
        return;
      }
      onChange(!checked);
    };

    const lightweightRoot = (
      <div
        aria-checked={checked}
        className={
          lightweightRootClassName
            ? `${lightweightRootClassName} ${rootClassName}`.trim()
            : rootClassName
        }
        data-canvas-owned-lightweight-switch="true"
        data-canvas-owned-switch-track={canvasOwnedTrack ? "true" : undefined}
        data-state={switchState}
        role="switch"
        tabIndex={isDisabled ? -1 : 0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleValue();
        }}
        onKeyDown={(e) => {
          if (e.code === "Escape") {
            e.stopPropagation();
            onEscape?.();
            return;
          }
          if (e.code === "Enter" || e.code === "Space") {
            e.preventDefault();
            e.stopPropagation();
            toggleValue();
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            e.stopPropagation();
          }
        }}
      >
        <span
          className={`${thumbBaseClassName} ${thumbResolvedThemeClassName}`}
          data-canvas-owned-switch-thumb={
            canvasOwnedTrack ? "true" : undefined
          }
          data-state={switchState}
        />
      </div>
    );

    if (lightweightRootClassName) {
      return lightweightRoot;
    }

    return <div className={outerClassName}>{lightweightRoot}</div>;
  }

  return (
    <div className={outerClassName}>
      <Switch.Root
        className={`${rootBaseClassName} ${rootResolvedThemeClassName}`}
        checked={checked}
        data-canvas-owned-switch-track={canvasOwnedTrack ? "true" : undefined}
        disabled={isDisabled}
        onCheckedChange={onChange}
        onKeyDown={(e) => {
          if (e.code === "Escape") {
            // have to stop propagation to prevent section from becoming unselected
            e.stopPropagation();
            onEscape?.();
          }
        }}
      >
        <Switch.Thumb
          className={`${thumbBaseClassName} ${thumbResolvedThemeClassName}`}
          data-canvas-owned-switch-thumb={
            canvasOwnedTrack ? "true" : undefined
          }
        />
      </Switch.Root>
    </div>
  );
}
