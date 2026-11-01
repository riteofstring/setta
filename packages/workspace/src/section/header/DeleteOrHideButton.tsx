import type { MouseEvent } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import {
  captureSectionRemovalFocusTarget,
  restoreFocusAfterSectionRemoval,
} from "../../controls/sectionFocus.js";
import { useWorkspaceCapabilities } from "../../document/capabilities.js";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors.js";
import { deleteSection } from "../../document/sectionMutations.js";
import { useWorkspaceDocument } from "../../document/stores.js";
import {
  getWorkspaceSavedViewSectionAction,
  setWorkspaceSavedViewSectionsDisplayed,
} from "../../saved-views/editing.js";
import { useWorkspaceSavedViewEditing } from "../../saved-views/editingState.js";
import { getWorkspaceSavedViewsOperationDisabledReason } from "../../saved-views/operations.js";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";

type DeleteOrHideButtonProps = {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
  label?: string;
};

type DeleteOrHideButtonPresentationProps = {
  hasSectionStyleTheme: boolean;
  isGroup: boolean;
  sectionId: string;
};

function getButtonClassName({
  hasSectionStyleTheme,
  isGroup,
  disabled,
  visibilityMode,
}: {
  hasSectionStyleTheme: boolean;
  isGroup: boolean;
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
  const sizeClass = isGroup ? "h-5 min-w-5 w-5" : "h-4 min-w-4";
  return `focus-visible:ring-2 inline-flex items-center nodrag flex shrink-0 justify-center ${defaultBg} ${defaultColor} rounded-full p-0 ${sizeClass} ${cursorClass}`;
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
  isGroup,
  sectionId,
}: DeleteOrHideButtonPresentationProps) {
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
        isGroup,
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
      <Icon aria-hidden="true" className={isGroup ? "h-4 w-4" : undefined} />
    </button>
  );
}

function DeleteSectionButton({
  hasSectionStyleTheme,
  isGroup,
  label,
  sectionId,
}: DeleteOrHideButtonPresentationProps & { label: string }) {
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
        isGroup,
        visibilityMode: false,
      })}
      data-setta-workspace-touch-target="compact"
      disabled={!canEditStructure}
      title={label}
      type="button"
      onClick={onClick}
      {...getWorkspaceTooltipHandlers(host, { content: label })}
    >
      <i
        aria-hidden="true"
        className={isGroup ? "gg-close [--ggs:.75]" : "gg-close"}
      />
    </button>
  );
}

export function DeleteOrHideButton({
  sectionId,
  hasSectionStyleTheme = false,
  label = "Delete section",
}: DeleteOrHideButtonProps) {
  const editing = useWorkspaceSavedViewEditing();
  const isGroup = useWorkspaceDocument((state) =>
    isGroupSection(getSectionOrThrow(state, sectionId)),
  );
  const savedViewsEnabled = useWorkspaceDocument(
    (state) => state.savedViews !== null,
  );
  if (editing && savedViewsEnabled) {
    return (
      <SavedViewVisibilityButton
        hasSectionStyleTheme={hasSectionStyleTheme}
        isGroup={isGroup}
        sectionId={sectionId}
      />
    );
  }
  return (
    <DeleteSectionButton
      hasSectionStyleTheme={hasSectionStyleTheme}
      isGroup={isGroup}
      label={label}
      sectionId={sectionId}
    />
  );
}
