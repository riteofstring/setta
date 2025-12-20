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
      setCurrEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
        isHorizontalOrientation: !isHorizontalOrientation,
      });
    });
  }

  return (
    <button
      className="focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer flex justify-center bg-transparent justify-content-center mr-1 text-setta-400 dark:text-setta-600 hover:text-setta-500 dark:hover:text-setta-400 rounded-full p-0 w-4 h-4"
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
