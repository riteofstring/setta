import {
  TbArrowBigDownLinesFilled,
  TbArrowBigRightLinesFilled,
} from "react-icons/tb";
import {
  getCurrEffectiveSectionImpl,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export function ChangeOrientationButton({ sectionId }) {
  const isHorizontalOrientation = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.type === SectionTypeEnum.Group && impl.isHorizontalOrientation;
  });

  function onClick() {
    useProjectState.setState((state) => {
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      if (impl.type !== SectionTypeEnum.Group) {
        return;
      }
      setCurrEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
        isHorizontalOrientation: !impl.isHorizontalOrientation,
      });
    });
  }

  return (
    <button
      className="nodrag justify-content-center mr-1 flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-400 hover:text-setta-500 focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-400"
      onClick={onClick}
    >
      {!isHorizontalOrientation ? (
        <TbArrowBigDownLinesFilled />
      ) : (
        <TbArrowBigRightLinesFilled />
      )}
    </button>
  );
}
