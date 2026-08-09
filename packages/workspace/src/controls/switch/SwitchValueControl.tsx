import * as Switch from "@radix-ui/react-switch";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME } from "../../interaction";
import { focusSectionAfterEscape } from "../sectionFocus";

// The item-controls milestone's boolean switch: the reference `SwitchInput` at the `ParamUI`
// switch presentation — the recorded 10 px Radix track and thumb inside 3.2 px padding at full
// radius, `blue-500`/dark `blue-700` checked paint, and the 16 px checked thumb translation.
// The reference's theme-override props have no `ParamUI` caller and stay behind. The control
// disables from the host flag and, package-wide, while item-select mode is active — the
// reference's interaction-first disabled contract with no blanket opacity treatment.

export type SwitchValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  disabled?: boolean;
};

// The `ParamUI` placement wrapper plus the reference `SwitchInput` base and default theme
// class strings, verbatim.
const OUTER_DIV_CLASS_NAME = "section-value flex justify-self-start self-center";
const ROOT_CLASS_NAME = `${NO_DRAG_CLASS_NAME} relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none bg-setta-400 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700`;
const THUMB_CLASS_NAME =
  "block h-2.5 w-2.5 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 bg-white dark:bg-setta-800";

export function SwitchValueControl({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  disabled = false,
}: SwitchValueControlProps) {
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const isDisabled = disabled || isSelectingItems;
  return (
    <div className={OUTER_DIV_CLASS_NAME}>
      <Switch.Root
        aria-label={ariaLabel}
        className={ROOT_CLASS_NAME}
        // The reference parse is `value === true || value === "true"`; the boolean branch is
        // unrepresentable across the package's string seam.
        checked={value === "true"}
        disabled={isDisabled}
        // The reference host stringifies the boolean commit (`_.toString` in its value seam);
        // the package seam carries only the stringified form.
        onCheckedChange={(checked) => onValueChange(String(checked))}
        onKeyDown={(e) => {
          if (e.code === "Escape") {
            // have to stop propagation to prevent section from becoming unselected
            e.stopPropagation();
            focusSectionAfterEscape(sectionId);
          }
        }}
      >
        <Switch.Thumb className={THUMB_CLASS_NAME} />
      </Switch.Root>
    </div>
  );
}
