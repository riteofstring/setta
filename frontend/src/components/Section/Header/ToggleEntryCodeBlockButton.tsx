import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { MdMemory } from "react-icons/md";
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

  return (
    <button
      className={`focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer flex justify-center ${
        isEntryCodeBlock ? "hover:bg-blue-500" : "bg-transparent"
      } ${
        isEntryCodeBlock
          ? "text-blue-500 hover:!text-cyan-200"
          : "text-setta-600 hover:!text-blue-500"
      } active:!text-blue-500 rounded-full p-0 mr-1 w-4 h-4`}
      onClick={onClick}
      {...getFloatingBoxHandlers({ title: "Toggle Entry Code Block" })}
    >
      <MdMemory />
    </button>
  );
}
