import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { RiPlayMiniFill } from "react-icons/ri";
import { runCodeBlocks } from "state/actions/project/generateCode";

export function RunButton({ sectionId }) {
  function onClick() {
    runCodeBlocks([sectionId]);
  }

  return (
    <IconButton
      icon={<RiPlayMiniFill />}
      color="text-setta-600 hover:text-green-500  active:!text-white"
      bg="bg-transparent active:bg-green-500 active:shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.1)] dark:active:shadow-[inset_0_1px_1px_0_rgb(0_0_0_/_0.4)] transition-colors"
      size="w-4 h-4"
      padding="p-0 mr-1"
      onClick={onClick}
    />
  );
}
