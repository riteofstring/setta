import _ from "lodash";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors";
import { togglePositionLock } from "../../document/sectionMutations";
import { useWorkspaceDocument } from "../../document/stores";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip";
import { useWorkspaceHost } from "../../workspaceHostContext";

type LockPositionButtonStyleState = {
  canEditLayout: boolean;
  hasSectionStyleTheme: boolean;
  isGroup: boolean;
  positionAndSizeLocked: boolean;
};

type LockPositionButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
};

function getIconSizeClassName({
  isGroup,
  positionAndSizeLocked,
}: Pick<
  LockPositionButtonStyleState,
  "isGroup" | "positionAndSizeLocked"
>): string {
  if (!isGroup) {
    return "[&>i]:!scale-[.4]";
  }
  return positionAndSizeLocked
    ? "[&>i]:!-mt-[6px]"
    : "[&>i]:!scale-50 [&>i]:!-mt-[9px]";
}

function getToneClassNames({
  hasSectionStyleTheme,
  isGroup,
  positionAndSizeLocked,
}: Pick<
  LockPositionButtonStyleState,
  "hasSectionStyleTheme" | "isGroup" | "positionAndSizeLocked"
>) {
  if (hasSectionStyleTheme) {
    return positionAndSizeLocked
      ? {
          backgroundClassName: "bg-[color:var(--setta-section-style-bg)]",
          focusRingClassName:
            "focus-visible:ring-[var(--setta-section-style-outline)]",
          hoverClassName: "",
          textClassName: "text-[color:var(--setta-section-style-outline)]",
        }
      : {
          backgroundClassName:
            "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]",
          focusRingClassName:
            "focus-visible:ring-[var(--setta-section-style-outline)]",
          hoverClassName: "",
          textClassName:
            "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)]",
        };
  }
  if (positionAndSizeLocked) {
    return {
      backgroundClassName:
        "shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] hover:bg-orange-500 dark:border-transparent dark:bg-transparent dark:shadow-none dark:hover:bg-orange-500",
      focusRingClassName: "",
      hoverClassName: "hover:text-orange-500 dark:hover:text-orange-700",
      textClassName:
        "text-orange-600 hover:!text-orange-100 dark:text-orange-500 dark:hover:!text-orange-100",
    };
  }
  return {
    backgroundClassName: "bg-transparent",
    focusRingClassName: "",
    hoverClassName: "hover:text-orange-500 dark:hover:text-orange-700",
    textClassName: isGroup
      ? "text-setta-400 dark:text-setta-600"
      : "text-setta-600",
  };
}

function getButtonClassName(styleState: LockPositionButtonStyleState): string {
  const {
    backgroundClassName,
    focusRingClassName,
    hoverClassName,
    textClassName,
  } = getToneClassNames(styleState);
  const sizeClassName = styleState.isGroup ? "h-5 w-5" : "h-4 w-4";
  return [
    "nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2",
    focusRingClassName,
    backgroundClassName,
    getIconSizeClassName(styleState),
    textClassName,
    "me-1 rounded-full p-0",
    hoverClassName,
    sizeClassName,
    styleState.canEditLayout ? "" : "cursor-not-allowed opacity-50",
  ]
    .filter(Boolean)
    .join(" ");
}

export function LockPositionButton({
  sectionId,
  hasSectionStyleTheme = false,
}: LockPositionButtonProps) {
  const host = useWorkspaceHost();
  const { isGroup, positionAndSizeLocked } = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return {
      isGroup: isGroupSection(section),
      positionAndSizeLocked: section.positionAndSizeLocked,
    };
  }, _.isEqual);
  const canEditLayout = useWorkspaceCapabilities((x) => x.canEditLayout);
  const iconClassName = positionAndSizeLocked ? "gg-lock" : "gg-lock-unlock";
  const label = positionAndSizeLocked
    ? "Unlock position and size"
    : "Lock position and size";
  const buttonClassName = getButtonClassName({
    canEditLayout,
    hasSectionStyleTheme,
    isGroup,
    positionAndSizeLocked,
  });

  function onClick() {
    if (!canEditLayout) {
      return;
    }
    togglePositionLock(host, sectionId);
  }

  return (
    <button
      className={buttonClassName}
      aria-label={label}
      onClick={onClick}
      disabled={!canEditLayout}
      title={label}
      type="button"
      data-setta-workspace-touch-target="compact"
      {...getWorkspaceTooltipHandlers(host, { content: label })}
    >
      <i aria-hidden="true" className={iconClassName} />
    </button>
  );
}
