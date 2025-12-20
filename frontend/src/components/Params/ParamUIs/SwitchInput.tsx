import * as Switch from "@radix-ui/react-switch";

type SwitchInputProps = {
  value: boolean | string;
  defaultVal?: boolean | string;
  onChange: (value: boolean) => void;
  onEscape?: () => void;
  isDisabled?: boolean;
  outerDivClassName?: string;
  twRootClasses?: string;
  twThumbClasses?: string;
};

export function SwitchInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  outerDivClassName,
  twRootClasses,
  twThumbClasses,
}: SwitchInputProps) {
  const valueBool = typeof value === "string" ? value === "true" : value;
  const rootClassName = [
    "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none",
    twRootClasses,
  ]
    .filter(Boolean)
    .join(" ");
  const thumbClassName = [
    "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4",
    twThumbClasses,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={outerDivClassName}>
      <Switch.Root
        className={rootClassName}
        checked={valueBool}
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
        <Switch.Thumb className={thumbClassName} />
      </Switch.Root>
    </div>
  );
}
