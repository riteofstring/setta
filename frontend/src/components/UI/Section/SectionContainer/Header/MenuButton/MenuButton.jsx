import * as Menubar from "@radix-ui/react-menubar";
import C from "constants/constants.json";
import { useGetSectionType } from "hooks/useSectionType";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
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
    C.CODE,
    C.TERMINAL,
    C.GLOBAL_PARAM_SWEEP,
    C.GLOBAL_VARIABLES,
    C.PARAM_SWEEP,
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
        {![C.PARAM_SWEEP, C.CODE, C.VAR_CONTROL].includes(sectionType) && (
          <SaveCustomArgumentsButton sectionId={sectionId} />
        )}

        {sectionType === C.PARAM_SWEEP ? (
          <CreateNewParamSweepButton sectionId={sectionId} />
        ) : (
          <CreateNewVersionButton sectionId={sectionId} />
        )}

        {![C.PARAM_SWEEP, C.CODE, C.VAR_CONTROL].includes(sectionType) && (
          <MultirunButton sectionId={sectionId} />
        )}

        <FreezeButton sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
