import * as Menubar from "@radix-ui/react-menubar";
import { useGetSectionType } from "hooks/useSectionType";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import {
  CODE,
  GLOBAL_PARAM_SWEEP,
  GLOBAL_VARIABLES,
  PARAM_SWEEP,
  TERMINAL,
  VAR_CONTROL,
} from "z_utils/constants";
import { HeaderIcon } from "../HeaderIcon/HeaderIcon";
import { CreateNewParamSweepButton } from "./CreateNewParamSweepButton/CreateNewParamSweepButton";
import { CreateNewVersionButton } from "./CreateNewVersionButton/CreateNewVersionButton";
import { FreezeButton } from "./FreezeButton/FreezeButton";
import { MultirunButton } from "./MultiRunButton/MultiRunButton";
import { SaveCustomArgumentsButton } from "./SaveCustomArgumentsButton/SaveCustomArgumentsButton";
function MenuButton({ sectionId, sectionTypeName }) {
  // hover:bg-runcoder-100 dark:hover:bg-runcoder-900
  const sectionType = useGetSectionType(sectionId, "type");
  console.log("sectionTypeName: ", sectionTypeName);

  const isSpecial = [
    CODE,
    TERMINAL,
    GLOBAL_PARAM_SWEEP,
    GLOBAL_VARIABLES,
    PARAM_SWEEP,
  ].includes(sectionTypeName);

  return (
    <Menubar.Root>
      <MenuDropdown
        padding={"p-1 mx-1"}
        rounded="rounded-full"
        triggerStyle={`${isSpecial ? "" : "h-3 w-3 text-runcoder-600 hover:text-white"} `}
        trigger={
          <HeaderIcon
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            classes=" "
          />
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

        {![PARAM_SWEEP, CODE, VAR_CONTROL].includes(sectionType) && (
          <MultirunButton sectionId={sectionId} />
        )}

        <FreezeButton sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
