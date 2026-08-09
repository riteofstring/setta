import { TbArrowBigDownLinesFilled, TbArrowBigRightLinesFilled } from "react-icons/tb";
import { getSectionOrThrow, isGroupSection } from "../../document/documentSelectors";
import { toggleGroupOrientation } from "../../document/sectionMutations";
import { useWorkspaceDocument } from "../../document/stores";

// The reference's group-header `ChangeOrientationButton`: flips a group between vertical and
// horizontal child flow.
type ChangeOrientationButtonProps = {
  sectionId: string;
};

export function ChangeOrientationButton({ sectionId }: ChangeOrientationButtonProps) {
  const isHorizontalOrientation = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return isGroupSection(section) && section.isHorizontalOrientation;
  });

  return (
    <button
      className="nodrag justify-content-center mr-1 flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-400 hover:text-setta-500 focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-400"
      onClick={() => toggleGroupOrientation(sectionId)}
      aria-label={
        isHorizontalOrientation ? "Stack children vertically" : "Flow children horizontally"
      }
      type="button"
    >
      {!isHorizontalOrientation ? <TbArrowBigDownLinesFilled /> : <TbArrowBigRightLinesFilled />}
    </button>
  );
}
