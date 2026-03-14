import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import {
  getActiveViewModeConfig,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_delete_sections,
  route_toggle_section_visibility,
} from "utils/generatedEndpoints";

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

// absolute top-1 right-1
export function DeleteOrHideButton({
  sectionId,
  ...props
}: DeleteOrHideButtonProps) {
  const { canEditStructure } = useShareCapabilities();
  const { visibility, isEditingViewMode } = useProjectState((state) => {
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
  });

  const canToggleVisibility = canEditStructure;

  const onClick = () => {
    if (!canToggleVisibility) {
      return;
    }
    if (isEditingViewMode) {
      route_toggle_section_visibility({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: [sectionId],
      });
      return;
    }
    route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: [sectionId],
    });
  };

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

  const label = getDeleteOrHideLabel(isEditingViewMode, visibility);
  const defaultIcon = getDeleteOrHideIcon(isEditingViewMode, visibility);
  const resolvedOnClick = onClickOverride ?? onClick;
  const resolvedIcon = icon ?? defaultIcon;
  const isDisabled = !canToggleVisibility;
  const cursorClass = isDisabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-pointer";
  const defaultBg = hasSectionStyleTheme
    ? "bg-transparent hover:bg-[color:var(--setta-section-style-bg)]"
    : "bg-transparent hover:bg-red-500";
  const defaultColor = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]"
    : "text-setta-600 hover:text-white";

  if (render) {
    return render({
      isEditingViewMode,
      visibility,
      icon: resolvedIcon,
      label,
      onClick: resolvedOnClick,
    });
  }

  return (
    <button
      className={`focus-visible:ring-2 ${
        grid ? "grid place-items-center" : "inline-flex items-center"
      } nodrag flex justify-center ${
        bg ?? defaultBg
      } ${color ?? defaultColor} ${
        rounded ?? "rounded-full"
      } ${padding ?? "p-0"} ${size ?? "h-4 min-w-4"} ${cursorClass} ${
        twClasses ?? ""
      }`}
      aria-label={label}
      {...buttonProps}
      onClick={resolvedOnClick}
      disabled={buttonProps.disabled || isDisabled}
      title={label}
      type="button"
      {...getFloatingBoxHandlers({ content: label })}
    >
      {resolvedIcon}
      {children}
    </button>
  );
  // return <button onClick={onClick} className="gg-close" />;
}

function getDeleteOrHideIcon(isEditingViewMode: boolean, visibility: boolean) {
  if (isEditingViewMode) {
    if (visibility) {
      return <BiShow />;
    }
    return <BiHide />;
  }
  return <i className="gg-close" />;
}

function getDeleteOrHideLabel(isEditingViewMode: boolean, visibility: boolean) {
  if (isEditingViewMode) {
    if (visibility) {
      return "Hide section";
    }
    return "Show section";
  }
  return "Delete section";
}
