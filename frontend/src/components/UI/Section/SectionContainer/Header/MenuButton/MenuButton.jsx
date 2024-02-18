import * as Menubar from "@radix-ui/react-menubar";
import { useGetSectionType } from "hooks/useSectionType";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { GLOBAL_VARIABLES, PARAM_SWEEP } from "z_utils/constants";
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
        trigger={<i className="gg-shape-circle" />}
      >
        {sectionType !== PARAM_SWEEP && (
          <SaveCustomArgumentsButton sectionId={sectionId} />
        )}
        {sectionType === PARAM_SWEEP ? (
          <CreateNewParamSweepButton sectionId={sectionId} />
        ) : (
          <CreateNewEnteredValuesButton sectionId={sectionId} />
        )}
        {![PARAM_SWEEP, GLOBAL_VARIABLES].includes(sectionType) && (
          <DeriveButton sectionId={sectionId} />
        )}
        {sectionType !== PARAM_SWEEP && (
          <MultirunButton sectionId={sectionId} />
        )}
        <FreezeButton sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
