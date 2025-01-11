import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { MdMemory } from "react-icons/md";
import { useSectionInfos } from "state/definitions";

export function ToggleRunInMemoryButton({ sectionId }) {
  const runInMemory = useSectionInfos((x) => x.x[sectionId].runInMemory);

  function onClick() {
    useSectionInfos.setState((state) => {
      state.x[sectionId].runInMemory = !runInMemory;
    });
  }

  return (
    <IconButton
      icon={<MdMemory />}
      color={`${runInMemory ? "dark:text-orange-500 text-orange-500 hover:!text-orange-100 dark:hover:!text-orange-100" : "text-setta-600"} hover:text-orange-500 dark:hover:text-orange-700`}
      size="w-4 h-4"
      padding="p-0 mr-1"
      onClick={onClick}
    />
  );
}
