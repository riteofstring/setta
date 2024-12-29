import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCodeBlock } from "state/actions/project/generateCode";

export function RunButton({ sectionId }) {
  function onClick() {
    runCodeBlock(sectionId);
  }

  return (
    <IconButton
      icon={<RiPlayMiniFill />}
      color="text-setta-600 hover:text-orange-500 dark:hover:text-orange-700"
      size="w-4 h-4"
      padding="p-0 mr-1"
      onClick={onClick}
    />
  );
}
