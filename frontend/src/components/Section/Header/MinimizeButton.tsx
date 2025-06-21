import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import {
  getEffectiveSectionImpl,
  getSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";

export function MinimizeButton({ sectionId, twClasses, ...props }) {
  const isMinimized = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    return impl.isMinimized;
  });
  function onClick() {
    useProjectState.setState((state) => {
      getSectionImpl(state, sectionId).isMinimized = !isMinimized;
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
      twClasses={twClasses}
      onClick={onClick}
    />
  );
}
