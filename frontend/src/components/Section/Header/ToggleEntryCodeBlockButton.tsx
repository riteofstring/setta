import { IconButton } from "components/Utils/atoms/buttons/IconButton";
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
    <IconButton
      icon={<MdMemory />}
      color={`${isEntryCodeBlock ? "text-blue-500 hover:!text-cyan-200" : "text-setta-600 hover:!text-blue-500"}  active:!text-blue-500`}
      bg={`${isEntryCodeBlock ? "hover:bg-blue-500" : "bg-transparent"}`}
      size="w-4 h-4"
      padding="p-0 mr-1"
      onClick={onClick}
      {...getFloatingBoxHandlers({ title: "Toggle Entry Code Block" })}
    />
  );
}
