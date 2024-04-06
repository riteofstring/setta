import * as Menubar from "@radix-ui/react-menubar";
import { useGetSectionType } from "hooks/useSectionType";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import {
  CODE,
  GLOBAL_VARIABLES,
  PARAM_SWEEP,
  VAR_CONTROL,
} from "z_utils/constants";
import { CreateNewParamSweepButton } from "./CreateNewParamSweepButton/CreateNewParamSweepButton";
import { CreateNewVersionButton } from "./CreateNewVersionButton/CreateNewVersionButton";
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
        triggerStyle="ml-1 h-3 w-3 text-runcoder-600 hover:text-white"
        trigger={
          <i class="gg-menu text-runcoder-300 dark:text-runcoder-500"></i>
        }
      >
        {![PARAM_SWEEP, CODE, VAR_CONTROL].includes(sectionType) && (
          <SaveCustomArgumentsButton sectionId={sectionId} />
        )}

        {sectionType === PARAM_SWEEP ? (
          <CreateNewParamSweepButton sectionId={sectionId} />
        ) : (
          <CreateNewVersionButton sectionId={sectionId} />
        )}

        {![PARAM_SWEEP, GLOBAL_VARIABLES, CODE, VAR_CONTROL].includes(
          sectionType,
        ) && <DeriveButton sectionId={sectionId} />}

        {![PARAM_SWEEP, CODE, VAR_CONTROL].includes(sectionType) && (
          <MultirunButton sectionId={sectionId} />
        )}

        <FreezeButton sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
