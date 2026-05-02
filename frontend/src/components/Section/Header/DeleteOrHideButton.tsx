import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { deleteSections, toggleSectionVisibility } from "openapi/http";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import {
  getActiveViewModeConfig,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
type DeleteOrHideButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  sectionId: string;
  hasSectionStyleTheme?: boolean;
  icon?: ReactNode;
  twClasses?: string;
  size?: string;
  padding?: string;
  bg?: string;
  color?: string;
  rounded?: string;
  grid?: boolean;
  render?: (state: DeleteOrHideButtonRenderState) => ReactNode;
};
type DeleteOrHideButtonRenderState = {
  isEditingViewMode: boolean;
  visibility: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};
type DeleteOrHideMode = "delete" | "hide" | "show";
type DeleteOrHideActionKey = "delete" | "toggleVisibility";
type DeleteOrHideVariant = {
  actionKey: DeleteOrHideActionKey;
  label: string;
  renderIcon: () => ReactNode;
};
type DeleteOrHideResolvedState = DeleteOrHideButtonRenderState & {
  disabled: boolean;
};

const DELETE_OR_HIDE_VARIANTS: Record<DeleteOrHideMode, DeleteOrHideVariant> = {
  delete: {
    actionKey: "delete",
    label: "Delete section",
    renderIcon: () => <i className="gg-close" />,
  },
  hide: {
    actionKey: "toggleVisibility",
    label: "Hide section",
    renderIcon: () => <BiShow />,
  },
  show: {
    actionKey: "toggleVisibility",
    label: "Show section",
    renderIcon: () => <BiHide />,
  },
};

const DELETE_OR_HIDE_ACTIONS: Record<
  DeleteOrHideActionKey,
  (sectionId: string) => void
> = {
  delete: (sectionId) => {
    callOpenAPI(
      deleteSections({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: [sectionId],
        },
      } as Parameters<typeof deleteSections>[0]),
    );
  },
  toggleVisibility: (sectionId) => {
    callOpenAPI(
      toggleSectionVisibility({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionIds: [sectionId],
        },
      } as Parameters<typeof toggleSectionVisibility>[0]),
    );
  },
};

// absolute top-1 right-1
export function DeleteOrHideButton({
  sectionId,
  ...props
}: DeleteOrHideButtonProps) {
  const { canEditStructure } = useShareCapabilities();
  const { visibility, isEditingViewMode } = useProjectState(
    selectDeleteOrHideProjectState(sectionId),
  );
  const {
    hasSectionStyleTheme = false,
    icon,
    children,
    twClasses,
    size,
    padding,
    bg,
    color,
    rounded,
    grid,
    onClick: onClickOverride,
    render,
    ...buttonProps
  } = props;
  const resolvedState = createDeleteOrHideResolvedState({
    sectionId,
    canEditStructure,
    isEditingViewMode,
    visibility,
    iconOverride: icon,
    onClickOverride,
  });
  if (render) {
    return render(resolvedState);
  }
  return (
    <button
      className={getDeleteOrHideButtonClassName({
        hasSectionStyleTheme,
        grid,
        bg,
        color,
        rounded,
        padding,
        size,
        twClasses,
        disabled: resolvedState.disabled,
      })}
      aria-label={resolvedState.label}
      {...buttonProps}
      onClick={resolvedState.onClick}
      disabled={isDeleteOrHideButtonDisabled(
        buttonProps.disabled,
        resolvedState.disabled,
      )}
      title={resolvedState.label}
      type="button"
      {...getFloatingBoxHandlers({ content: resolvedState.label })}
    >
      {resolvedState.icon}
      {children}
    </button>
  );
  // return <button onClick={onClick} className="gg-close" />;
}

function selectDeleteOrHideProjectState(sectionId: string) {
  return (
    state: Parameters<typeof useProjectState>[0] extends (
      selector: (state: infer T) => unknown,
    ) => unknown
      ? T
      : never,
  ) => {
    const viewMode = getActiveViewModeConfig(state);
    const visibility = viewMode.visibilityBySectionId[sectionId];
    if (visibility === undefined) {
      throw new Error(
        `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
      );
    }
    return {
      visibility,
      isEditingViewMode: state.projectConfig.isEditingViewMode,
    };
  };
}

function createDeleteOrHideResolvedState({
  sectionId,
  canEditStructure,
  isEditingViewMode,
  visibility,
  iconOverride,
  onClickOverride,
}: {
  sectionId: string;
  canEditStructure: boolean;
  isEditingViewMode: boolean;
  visibility: boolean;
  iconOverride: ReactNode | undefined;
  onClickOverride: (() => void) | undefined;
}): DeleteOrHideResolvedState {
  const variant = getDeleteOrHideVariant(isEditingViewMode, visibility);
  return {
    isEditingViewMode,
    visibility,
    icon: iconOverride ?? variant.renderIcon(),
    label: variant.label,
    onClick:
      onClickOverride ??
      createDeleteOrHideOnClick(canEditStructure, variant, sectionId),
    disabled: !canEditStructure,
  };
}

function getDeleteOrHideVariant(
  isEditingViewMode: boolean,
  visibility: boolean,
): DeleteOrHideVariant {
  return DELETE_OR_HIDE_VARIANTS[
    resolveDeleteOrHideMode(isEditingViewMode, visibility)
  ];
}

function resolveDeleteOrHideMode(
  isEditingViewMode: boolean,
  visibility: boolean,
): DeleteOrHideMode {
  if (isEditingViewMode) {
    if (visibility) {
      return "hide";
    }
    return "show";
  }
  return "delete";
}

function createDeleteOrHideOnClick(
  canEditStructure: boolean,
  variant: DeleteOrHideVariant,
  sectionId: string,
): () => void {
  if (!canEditStructure) {
    return () => {};
  }
  return () => {
    DELETE_OR_HIDE_ACTIONS[variant.actionKey](sectionId);
  };
}

function getDeleteOrHideButtonClassName({
  hasSectionStyleTheme,
  grid,
  bg,
  color,
  rounded,
  padding,
  size,
  twClasses,
  disabled,
}: {
  hasSectionStyleTheme: boolean;
  grid: boolean | undefined;
  bg: string | undefined;
  color: string | undefined;
  rounded: string | undefined;
  padding: string | undefined;
  size: string | undefined;
  twClasses: string | undefined;
  disabled: boolean;
}): string {
  const { defaultBg, defaultColor } =
    getDeleteOrHideButtonDefaults(hasSectionStyleTheme);
  const layoutClassName = grid
    ? "grid place-items-center"
    : "inline-flex items-center";
  const cursorClass = disabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-pointer";
  return `focus-visible:ring-2 ${layoutClassName} nodrag flex justify-center ${bg ?? defaultBg} ${color ?? defaultColor} ${rounded ?? "rounded-full"} ${padding ?? "p-0"} ${size ?? "h-4 min-w-4"} ${cursorClass} ${twClasses ?? ""}`;
}

function getDeleteOrHideButtonDefaults(hasSectionStyleTheme: boolean) {
  if (hasSectionStyleTheme) {
    return {
      defaultBg:
        "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]",
      defaultColor:
        "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]",
    };
  }
  return {
    defaultBg: "bg-transparent hover:bg-red-500",
    defaultColor: "text-setta-600 hover:text-white",
  };
}

function isDeleteOrHideButtonDisabled(
  buttonDisabled: boolean | undefined,
  isStateDisabled: boolean,
) {
  return Boolean(buttonDisabled || isStateDisabled);
}
