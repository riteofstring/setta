import * as Switch from "@radix-ui/react-switch";

type SwitchInputProps = {
  value: boolean | string;
  defaultVal?: boolean | string;
  onChange: (value: boolean) => void;
  onEscape?: () => void;
  isDisabled?: boolean;
  outerDivClassName?: string;
  rootClassName?: string;
  rootThemeClassName?: string;
  thumbThemeClassName?: string;
  flattenThumb?: boolean;
};

function toBeforeVariantClasses(classNames: string): string {
  return classNames
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const lastColonIndex = token.lastIndexOf(":");
      if (lastColonIndex === -1) {
        return `before:${token}`;
      }
      const variants = token.slice(0, lastColonIndex + 1);
      const utility = token.slice(lastColonIndex + 1);
      return `${variants}before:${utility}`;
    })
    .join(" ");
}

export function SwitchInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  outerDivClassName,
  rootClassName,
  rootThemeClassName,
  thumbThemeClassName,
  flattenThumb = false,
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
  const flattenedThumbClassName = flattenThumb
    ? `${toBeforeVariantClasses(`${thumbBaseClassName} ${thumbResolvedThemeClassName}`)} before:content-[''] before:pointer-events-none`
    : "";

  const switchRoot = (
    <Switch.Root
      className={`${rootBaseClassName} ${rootResolvedThemeClassName} ${flattenedThumbClassName} ${rootClassName ?? ""}`}
      checked={value === true || value === "true"}
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
      {!flattenThumb && (
        <Switch.Thumb
          className={`${thumbBaseClassName} ${thumbResolvedThemeClassName}`}
        />
      )}
    </Switch.Root>
  );

  if (!outerDivClassName) {
    return switchRoot;
  }

  return <div className={outerDivClassName}>{switchRoot}</div>;
}
