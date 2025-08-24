import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_toggle_minimized } from "utils/generatedEndpoints";

export function MinimizeButton({ sectionId, ...props }) {
  const isMinimized = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.isMinimized;
  });
  function onClick() {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue(state, sectionId, {
        isMinimized: !isMinimized,
      });
    });
    route_toggle_minimized({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
    });
  }

  return (
    <IconButton
      {...props}
      icon={
        !isMinimized ? (
          <i className="gg-math-minus" />
        ) : (
          <i className="gg-maximize !scale-[.4]" />
        )
      }
      color="text-setta-600 hover:text-white"
      bg="bg-transparent hover:bg-blue-500 justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      onClick={onClick}
    />
  );
}
