import type { MouseEvent } from "react";
import {
  captureSectionRemovalFocusTarget,
  restoreFocusAfterSectionRemoval,
} from "../../controls/sectionFocus";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { deleteSection } from "../../document/sectionMutations";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip";

// The reference's `DeleteOrHideButton`. The hide/show variants belong to view modes, which
// stayed application-side, so the slice always renders the reference's delete variant
// (css.gg close glyph) gated by `canEditStructure`.
type DeleteOrHideButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
  size?: string;
};

function getDeleteOrHideButtonClassName({
  hasSectionStyleTheme,
  size,
  disabled,
}: {
  hasSectionStyleTheme: boolean;
  size: string | undefined;
  disabled: boolean;
}): string {
  const { defaultBg, defaultColor } = getDeleteOrHideButtonDefaults(hasSectionStyleTheme);
  const cursorClass = disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer";
  return `focus-visible:ring-2 inline-flex items-center nodrag flex justify-center ${defaultBg} ${defaultColor} rounded-full p-0 ${size ?? "h-4 min-w-4"} ${cursorClass}`;
}

function getDeleteOrHideButtonDefaults(hasSectionStyleTheme: boolean) {
  if (hasSectionStyleTheme) {
    return {
      defaultBg: "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]",
      defaultColor:
        "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]",
    };
  }
  return {
    defaultBg: "bg-transparent hover:bg-red-500",
    defaultColor: "text-setta-600 hover:text-white",
  };
}

export function DeleteOrHideButton({
  sectionId,
  hasSectionStyleTheme = false,
  size,
}: DeleteOrHideButtonProps) {
  const canEditStructure = useWorkspaceCapabilities((x) => x.canEditStructure);
  const label = "Delete section";

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    if (!canEditStructure) {
      return;
    }
    const shouldRestoreFocus = document.activeElement === event.currentTarget;
    const focusTarget = shouldRestoreFocus ? captureSectionRemovalFocusTarget(sectionId) : null;
    deleteSection(sectionId);
    if (shouldRestoreFocus) {
      restoreFocusAfterSectionRemoval(focusTarget);
    }
  }

  return (
    <button
      className={getDeleteOrHideButtonClassName({
        hasSectionStyleTheme,
        size,
        disabled: !canEditStructure,
      })}
      aria-label={label}
      onClick={onClick}
      disabled={!canEditStructure}
      title={label}
      type="button"
      {...getWorkspaceTooltipHandlers({ content: label })}
    >
      <i aria-hidden="true" className="gg-close" />
    </button>
  );
}
