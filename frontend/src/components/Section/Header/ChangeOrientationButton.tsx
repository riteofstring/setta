import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import {
  TbArrowBigDownLinesFilled,
  TbArrowBigRightLinesFilled,
} from "react-icons/tb";
import {
  getEffectiveSectionImpl,
  setEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export function ChangeOrientationButton({ sectionId }) {
  const isHorizontalOrientation = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    return impl.type === SectionTypeEnum.Group && impl.isHorizontalOrientation;
  });

  function onClick() {
    useProjectState.setState((state) => {
      setEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
        isHorizontalOrientation: !isHorizontalOrientation,
      });
    });
  }

  return (
    <IconButton
      icon={
        !isHorizontalOrientation ? (
          <TbArrowBigDownLinesFilled />
        ) : (
          <TbArrowBigRightLinesFilled />
        )
      }
      color="text-setta-400 dark:text-setta-600 hover:text-setta-500 dark:hover:text-setta-400"
      bg="bg-transparent justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      onClick={onClick}
    />
  );
}
