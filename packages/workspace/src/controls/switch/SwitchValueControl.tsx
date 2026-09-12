import * as Switch from "@radix-ui/react-switch";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME } from "../../interaction";
import { focusSectionAfterEscape } from "../sectionFocus";
import { useWorkspaceHost } from "../../workspaceHostContext";

export type SwitchValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  disabled?: boolean;
};

type InspectorSwitchControlProps = {
  ariaLabel: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  onEscape: () => void;
};

const OUTER_DIV_CLASS_NAME =
  "section-value flex justify-self-start self-center";
const META_OUTER_DIV_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${OUTER_DIV_CLASS_NAME}`;
const ROOT_CLASS_NAME = `${NO_DRAG_CLASS_NAME} setta-workspace-native-reset relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none !bg-setta-400 data-[state='checked']:!bg-blue-500 dark:!bg-setta-600 dark:data-[state='checked']:!bg-blue-700`;
const THUMB_CLASS_NAME =
  "block h-2.5 w-2.5 rounded-full motion-safe:transition-all will-change-transform data-[state='checked']:translate-x-4 rtl:data-[state='checked']:-translate-x-4 bg-white dark:bg-setta-800";

export function SwitchValueControl(props: SwitchValueControlProps) {
  return (
    <SwitchValueControlCore {...props} outerClassName={OUTER_DIV_CLASS_NAME} />
  );
}

export function MetaSwitchValueControl(props: SwitchValueControlProps) {
  return (
    <SwitchValueControlCore
      {...props}
      outerClassName={META_OUTER_DIV_CLASS_NAME}
    />
  );
}

export function InspectorSwitchControl({
  ariaLabel,
  checked,
  disabled,
  onCheckedChange,
  onEscape,
}: InspectorSwitchControlProps) {
  return (
    <Switch.Root
      aria-label={ariaLabel}
      checked={checked}
      className={ROOT_CLASS_NAME}
      data-setta-workspace-touch-target="expanded"
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }}
    >
      <Switch.Thumb className={THUMB_CLASS_NAME} />
    </Switch.Root>
  );
}

function SwitchValueControlCore({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  disabled = false,
  outerClassName,
}: SwitchValueControlProps & { outerClassName: string }) {
  const host = useWorkspaceHost();
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  return (
    <div className={outerClassName}>
      <Switch.Root
        aria-label={ariaLabel}
        className={ROOT_CLASS_NAME}
        data-setta-workspace-touch-target="expanded"

        checked={value === "true"}
        disabled={isDisabled}

        onCheckedChange={(checked) => onValueChange(String(checked))}
        onKeyDown={(e) => {
          if (e.code === "Escape") {
            e.stopPropagation();
            focusSectionAfterEscape(host, sectionId);
          }
        }}
      >
        <Switch.Thumb className={THUMB_CLASS_NAME} />
      </Switch.Root>
    </div>
  );
}
