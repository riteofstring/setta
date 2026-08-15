import * as Switch from "@radix-ui/react-switch";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
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
// class strings. The package-only reset marker recreates main's global button reset without
// applying it to host-rendered controls inside the workspace surface.
const OUTER_DIV_CLASS_NAME = "section-value flex justify-self-start self-center";
const META_OUTER_DIV_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${OUTER_DIV_CLASS_NAME}`;
const ROOT_CLASS_NAME = `${NO_DRAG_CLASS_NAME} setta-workspace-native-reset relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none bg-setta-400 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700`;
const THUMB_CLASS_NAME =
  "block h-2.5 w-2.5 rounded-full motion-safe:transition-all will-change-transform data-[state='checked']:translate-x-4 rtl:data-[state='checked']:-translate-x-4 bg-white dark:bg-setta-800";

export function SwitchValueControl(props: SwitchValueControlProps) {
  return <SwitchValueControlCore {...props} outerClassName={OUTER_DIV_CLASS_NAME} />;
}

// Package-internal direct-on-canvas presentation. Behavior stays shared while the wrapper carries
// frozen main's full meta-control drag exclusion rather than relying only on the switch root.
export function MetaSwitchValueControl(props: SwitchValueControlProps) {
  return <SwitchValueControlCore {...props} outerClassName={META_OUTER_DIV_CLASS_NAME} />;
}

function SwitchValueControlCore({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  disabled = false,
  outerClassName,
}: SwitchValueControlProps & { outerClassName: string }) {
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  return (
    <div className={outerClassName}>
      <Switch.Root
        aria-label={ariaLabel}
        className={ROOT_CLASS_NAME}
        data-setta-workspace-touch-target="expanded"
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
