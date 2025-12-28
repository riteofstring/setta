import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { MdFlag } from "react-icons/md";
import { useProjectState } from "state/definitions";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";

export function ToggleEntryCodeBlockButton({
  sectionId,
  sectionTypeName,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
}) {
  const isEntryCodeBlock = useProjectState(
    (x) =>
      // null sectionId corresponds to gen python code block
      (sectionTypeName === SectionTypeEnum.GenPythonCode &&
        !x.projectConfig.entryCodeBlockId) ||
      sectionId === x.projectConfig.entryCodeBlockId,
  );

  function onClick() {
    useProjectState.setState((state) => {
      state.projectConfig.entryCodeBlockId =
        sectionTypeName === SectionTypeEnum.GenPythonCode ? null : sectionId;
    });
  }

  let backgroundClassName = "bg-transparent";
  let textClassName = "text-setta-600 hover:text-blue-500";
  if (isEntryCodeBlock) {
    backgroundClassName =
      "shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] hover:bg-blue-500 dark:border-transparent dark:bg-transparent dark:shadow-none dark:hover:bg-blue-500";
    textClassName =
      "text-blue-600 hover:!text-blue-100 dark:text-blue-500 dark:hover:!text-blue-100";
  }

  return (
    <button
      className={`nodrag flex inline-flex cursor-pointer items-center justify-center focus-visible:ring-2 ${backgroundClassName} ${textClassName} mr-1 h-4 w-4 rounded-full p-0`}
      onClick={onClick}
      {...getFloatingBoxHandlers({ title: "Toggle Entry Code Block" })}
    >
      <MdFlag />
    </button>
  );
}
