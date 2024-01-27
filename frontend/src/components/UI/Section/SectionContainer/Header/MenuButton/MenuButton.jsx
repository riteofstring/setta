import * as Menubar from "@radix-ui/react-menubar";
import { useGetSectionType } from "hooks/useSectionType";
import { FiSettings } from "react-icons/fi";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { PARAM_SWEEP } from "z_utils/constants";
import { CreateNewEnteredValuesButton } from "./CreateNewEnteredValuesButton/CreateNewEnteredValuesButton";
import { CreateNewParamSweepButton } from "./CreateNewParamSweepButton/CreateNewParamSweepButton";
import { DeriveButton } from "./DeriveButton/DeriveButton";
import { FreezeButton } from "./FreezeButton/FreezeButton";
import { MultirunButton } from "./MultiRunButton/MultiRunButton";
import { SaveCustomArgumentsButton } from "./SaveCustomArgumentsButton/SaveCustomArgumentsButton";

function MenuButton({ sectionId }) {
  // hover:bg-runcoder-100 dark:hover:bg-runcoder-900
  const sectionType = useGetSectionType(sectionId, "type");

  return (
    <Menubar.Root>
      <MenuDropdown
        padding="p-1"
        rounded="rounded-full"
        triggerStyle="ml-1"
        trigger={
          <FiSettings className="bg-transparent text-runcoder-300 transition-colors duration-150 hover:text-runcoder-500 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:text-runcoder-300" />
        }
      >
        <SaveCustomArgumentsButton sectionId={sectionId} />
        {sectionType === PARAM_SWEEP ? (
          <CreateNewParamSweepButton sectionId={sectionId} />
        ) : (
          <CreateNewEnteredValuesButton sectionId={sectionId} />
        )}
        <DeriveButton sectionId={sectionId} />
        <MultirunButton sectionId={sectionId} />
        <FreezeButton sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
