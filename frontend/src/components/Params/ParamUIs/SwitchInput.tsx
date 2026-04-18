import * as Switch from "@radix-ui/react-switch";

type SwitchInputProps = {
  canvasOwnedTrack?: boolean;
  value: boolean | string;
  defaultVal?: boolean | string;
  onChange: (value: boolean) => void;
  onEscape?: () => void;
  isDisabled?: boolean;
  outerDivClassName?: string;
  rootThemeClassName?: string;
  thumbThemeClassName?: string;
};

export function SwitchInput({
  canvasOwnedTrack,
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
    "bg-setta-400 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700";
  const thumbBaseClassName =
    "block h-2.5 w-2.5 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4";
  const thumbResolvedThemeClassName =
    thumbThemeClassName ?? "bg-white dark:bg-setta-800";
  return (
    <div className={outerDivClassName}>
      <Switch.Root
        className={`${rootBaseClassName} ${rootResolvedThemeClassName}`}
        checked={value === true || value === "true"}
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
        />
      </Switch.Root>
    </div>
  );
}
