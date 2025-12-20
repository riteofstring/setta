import * as Switch from "@radix-ui/react-switch";

type SwitchInputProps = {
  value: boolean | string;
  defaultVal?: boolean | string;
  onChange: (value: boolean) => void;
  onEscape?: () => void;
  isDisabled?: boolean;
  outerDivClassName?: string;
};

export function SwitchInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  outerDivClassName,
}: SwitchInputProps) {
  return (
    <div className={outerDivClassName}>
      <Switch.Root
        className="nodrag relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full bg-setta-400 p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700"
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
        <Switch.Thumb className="block h-2.5 w-2.5 rounded-full bg-white transition-all will-change-transform data-[state='checked']:translate-x-4 dark:bg-setta-800" />
      </Switch.Root>
    </div>
  );
}
