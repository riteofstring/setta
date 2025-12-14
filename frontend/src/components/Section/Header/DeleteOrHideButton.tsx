import { BiHide, BiShow } from "react-icons/bi";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getSectionVisibilityKey,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_delete_sections } from "utils/generatedEndpoints";
import {
  ViewingEditingMode,
  ViewingEditingModeEnum,
} from "utils/generatedTypes";

// absolute top-1 right-1
export function DeleteOrHideButton({
  sectionId,
  viewingEditingMode,
  ...props
}) {
  const visibility = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.visibility[getSectionVisibilityKey(viewingEditingMode)];
  });

  const onClick = () => {
    route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: [sectionId],
    });
    // useProjectState.setState((state) => {
    //   if (viewingEditingMode === ViewingEditingModeEnum.DEV) {
    //     route_delete_sections({projectConfigId: })
    //   } else if (viewingEditingMode === ViewingEditingModeEnum.USER_EDIT) {
    //     state.sections[sectionId].visibility[ViewingEditingModeEnum.USER] =
    //       !visibility;
    //   }
    // });
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
      } nodrag cursor-pointer flex justify-center ${
        bg ?? "bg-transparent hover:bg-red-500"
      } ${color ?? "text-setta-600 hover:text-white"} ${
        rounded ?? "rounded-full"
      } ${padding ?? "p-0"} ${size ?? "min-w-4 h-4"} ${twClasses ?? ""}`}
      {...buttonProps}
      onClick={onClickOverride ?? onClick}
    >
      {icon ?? getIcon(viewingEditingMode, visibility)}
      {children}
    </button>
  );
  // return <button onClick={onClick} className="gg-close" />;
}

function getIcon(viewingEditingMode: ViewingEditingMode, visibility: boolean) {
  switch (viewingEditingMode) {
    case ViewingEditingModeEnum.DEV:
      return <i className="gg-close" />;
    case ViewingEditingModeEnum.USER_EDIT:
      return visibility ? <BiShow /> : <BiHide />;
  }
}
