import {
  TbArrowBigDownLinesFilled,
  TbArrowBigRightLinesFilled,
} from "react-icons/tb";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors";
import { toggleGroupOrientation } from "../../document/sectionMutations";
import { useWorkspaceDocument } from "../../document/stores";
import { useWorkspaceHost } from "../../workspaceHostContext";

// The reference's group-header `ChangeOrientationButton`: flips a group between vertical and
// horizontal child flow.
type ChangeOrientationButtonProps = {
  sectionId: string;
};

export function ChangeOrientationButton({
  sectionId,
}: ChangeOrientationButtonProps) {
  const host = useWorkspaceHost();
  const isHorizontalOrientation = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return isGroupSection(section) && section.isHorizontalOrientation;
  });

  return (
    <button
      className="nodrag justify-content-center me-1 flex inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-400 hover:text-setta-500 focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-400"
      onClick={() => toggleGroupOrientation(host, sectionId)}
      aria-label={
        isHorizontalOrientation
          ? "Stack children vertically"
          : "Flow children horizontally"
      }
      type="button"
      data-setta-workspace-touch-target="compact"
    >
      {!isHorizontalOrientation ? (
        <TbArrowBigDownLinesFilled aria-hidden="true" focusable="false" />
      ) : (
        <TbArrowBigRightLinesFilled
          aria-hidden="true"
          className="rtl:scale-x-[-1]"
          focusable="false"
        />
      )}
    </button>
  );
}
