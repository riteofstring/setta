import type { MouseEvent } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import {
  captureSectionRemovalFocusTarget,
  restoreFocusAfterSectionRemoval,
} from "../../controls/sectionFocus";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { deleteSection } from "../../document/sectionMutations";
import { useWorkspaceDocument } from "../../document/stores";
import {
  getWorkspaceSavedViewSectionAction,
  setWorkspaceSavedViewSectionsDisplayed,
} from "../../saved-views/editing";
import { useWorkspaceSavedViewEditing } from "../../saved-views/editingState";
import { getWorkspaceSavedViewsOperationDisabledReason } from "../../saved-views/operations";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip";
import { useWorkspaceHost } from "../../workspaceHostContext";

type DeleteOrHideButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
  label?: string;
  size?: string;
};

function getButtonClassName({
  hasSectionStyleTheme,
  size,
  disabled,
  visibilityMode,
}: {
  hasSectionStyleTheme: boolean;
  size: string | undefined;
  disabled: boolean;
  visibilityMode: boolean;
}): string {
  const { defaultBg, defaultColor } = getButtonDefaults(
    hasSectionStyleTheme,
    visibilityMode,
  );
  const cursorClass = disabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-pointer";
  return `focus-visible:ring-2 inline-flex items-center nodrag flex justify-center ${defaultBg} ${defaultColor} rounded-full p-0 ${size ?? "h-4 min-w-4"} ${cursorClass}`;
}

function getButtonDefaults(
  hasSectionStyleTheme: boolean,
  visibilityMode: boolean,
) {
  if (hasSectionStyleTheme) {
    return {
      defaultBg:
        "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]",
      defaultColor:
        "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]",
    };
  }
  if (visibilityMode) {
    return {
      defaultBg: "bg-transparent hover:bg-setta-200 dark:hover:bg-setta-700",
      defaultColor:
        "text-setta-600 hover:text-setta-900 dark:text-setta-400 dark:hover:text-setta-100",
    };
  }
  return {
    defaultBg: "bg-transparent hover:bg-red-500",
    defaultColor: "text-setta-600 hover:text-white",
  };
}

function SavedViewVisibilityButton({
  hasSectionStyleTheme,
  sectionId,
  size,
}: Required<Pick<DeleteOrHideButtonProps, "hasSectionStyleTheme">> &
  Pick<DeleteOrHideButtonProps, "sectionId" | "size">) {
  const host = useWorkspaceHost();
  useWorkspaceCapabilities((capabilities) => capabilities.canEditLayout);
  const documentState = useWorkspaceDocument((state) => state);
  const action = getWorkspaceSavedViewSectionAction(documentState, [sectionId]);
  const disabledReason = getWorkspaceSavedViewsOperationDisabledReason(
    host,
    "visibility",
  );
  const disabled = disabledReason !== null;
  const label = `${action === "hide" ? "Hide" : "Show"} section in saved view`;
  const Icon = action === "hide" ? FiEyeOff : FiEye;

  function onClick(): void {
    if (disabled) {
      return;
    }
    setWorkspaceSavedViewSectionsDisplayed(
      host,
      [sectionId],
      action === "show",
    );
  }

  return (
    <button
      aria-label={label}
      className={getButtonClassName({
        disabled,
        hasSectionStyleTheme,
        size,
        visibilityMode: true,
      })}
      data-setta-workspace-touch-target="compact"
      data-workspace-saved-view-action={action}
      disabled={disabled}
      title={disabledReason ?? label}
      type="button"
      onClick={onClick}
      {...getWorkspaceTooltipHandlers(host, {
        content: disabledReason ?? label,
      })}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

function DeleteSectionButton({
  hasSectionStyleTheme,
  label,
  sectionId,
  size,
}: Required<Pick<DeleteOrHideButtonProps, "hasSectionStyleTheme" | "label">> &
  Pick<DeleteOrHideButtonProps, "sectionId" | "size">) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (capabilities) => capabilities.canEditStructure,
  );

  function onClick(event: MouseEvent<HTMLButtonElement>): void {
    if (!canEditStructure) {
      return;
    }
    const shouldRestoreFocus = document.activeElement === event.currentTarget;
    const focusTarget = shouldRestoreFocus
      ? captureSectionRemovalFocusTarget(host, sectionId)
      : null;
    deleteSection(host, sectionId);
    if (shouldRestoreFocus) {
      restoreFocusAfterSectionRemoval(host, focusTarget);
    }
  }

  return (
    <button
      aria-label={label}
      className={getButtonClassName({
        disabled: !canEditStructure,
        hasSectionStyleTheme,
        size,
        visibilityMode: false,
      })}
      data-setta-workspace-touch-target="compact"
      disabled={!canEditStructure}
      title={label}
      type="button"
      onClick={onClick}
      {...getWorkspaceTooltipHandlers(host, { content: label })}
    >
      <i aria-hidden="true" className="gg-close" />
    </button>
  );
}

export function DeleteOrHideButton({
  sectionId,
  hasSectionStyleTheme = false,
  label = "Delete section",
  size,
}: DeleteOrHideButtonProps) {
  const editing = useWorkspaceSavedViewEditing();
  const savedViewsEnabled = useWorkspaceDocument(
    (state) => state.savedViews !== null,
  );
  if (editing && savedViewsEnabled) {
    return (
      <SavedViewVisibilityButton
        hasSectionStyleTheme={hasSectionStyleTheme}
        sectionId={sectionId}
        size={size}
      />
    );
  }
  return (
    <DeleteSectionButton
      hasSectionStyleTheme={hasSectionStyleTheme}
      label={label}
      sectionId={sectionId}
      size={size}
    />
  );
}
