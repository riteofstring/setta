import {
  TbArrowBigDownLinesFilled,
  TbArrowBigRightLinesFilled,
} from "react-icons/tb";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../../document/documentSelectors.js";
import { toggleGroupOrientation } from "../../document/sectionMutations.js";
import { useWorkspaceDocument } from "../../document/stores.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";

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
      className="nodrag justify-content-center flex inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 text-setta-400 hover:text-setta-500 focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-400"
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
        <TbArrowBigDownLinesFilled
          aria-hidden="true"
          className="h-4 w-4"
          focusable="false"
        />
      ) : (
        <TbArrowBigRightLinesFilled
          aria-hidden="true"
          className="h-4 w-4 rtl:scale-x-[-1]"
          focusable="false"
        />
      )}
    </button>
  );
}
