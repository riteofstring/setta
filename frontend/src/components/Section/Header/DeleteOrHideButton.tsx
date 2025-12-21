import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import {
  getActiveViewModeConfig,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  route_delete_sections,
  route_toggle_section_visibility,
} from "utils/generatedEndpoints";

type DeleteOrHideButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  sectionId: string;
  icon?: ReactNode;
  twClasses?: string;
  size?: string;
  padding?: string;
  bg?: string;
  color?: string;
  rounded?: string;
  grid?: boolean;
};

// absolute top-1 right-1
export function DeleteOrHideButton({
  sectionId,
  ...props
}: DeleteOrHideButtonProps) {
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

  const onClick = () => {
    if (isEditingViewMode) {
      route_toggle_section_visibility({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
      });
      return;
    }
    route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: [sectionId],
    });
  };

  const {
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
    ...buttonProps
  } = props;

  return (
    <button
      className={`focus-visible:ring-2 ${
        grid ? "grid place-items-center" : "inline-flex items-center"
      } nodrag flex cursor-pointer justify-center ${
        bg ?? "bg-transparent hover:bg-red-500"
      } ${color ?? "text-setta-600 hover:text-white"} ${
        rounded ?? "rounded-full"
      } ${padding ?? "p-0"} ${size ?? "h-4 min-w-4"} ${twClasses ?? ""}`}
      {...buttonProps}
      onClick={onClickOverride ?? onClick}
    >
      {icon ?? getIcon(isEditingViewMode, visibility)}
      {children}
    </button>
  );
  // return <button onClick={onClick} className="gg-close" />;
}

function getIcon(isEditingViewMode: boolean, visibility: boolean) {
  if (isEditingViewMode) {
    return visibility ? <BiShow /> : <BiHide />;
  }
  return <i className="gg-close" />;
}
