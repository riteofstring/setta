import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { BiHide, BiShow } from "react-icons/bi";
import {
  getCurrEffectiveSectionImpl,
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
      projectConfigId: useProjectState.getState().projectConfig.id,
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

  return (
    <IconButton
      icon={getIcon(viewingEditingMode, visibility)}
      color="text-setta-600 hover:text-white"
      bg="bg-transparent hover:bg-red-500"
      size="min-w-4 h-4"
      padding="p-0"
      // twClasses={twClasses}
      onClick={onClick}
      {...props}
    />
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
