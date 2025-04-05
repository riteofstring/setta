import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import C from "constants/constants.json";
import { MdMemory } from "react-icons/md";
import { getSectionType } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";

export function ToggleEntryCodeBlockButton({ sectionId }) {
  const isEntryCodeBlock = useSectionInfos(
    (x) => x.x[sectionId].isEntryCodeBlock,
  );

  function onClick() {
    useSectionInfos.setState((state) => {
      for (const s of Object.values(state.x)) {
        if (getSectionType(s.id) === C.CODE) {
          state.x[s.id].isEntryCodeBlock = s.id === sectionId;
        }
      }
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
