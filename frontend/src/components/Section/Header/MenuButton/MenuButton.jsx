import * as Menubar from "@radix-ui/react-menubar";
import C from "constants/constants.json";
import { useGetSectionType } from "state/hooks/uiTypes";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { HeaderIcon } from "../HeaderIcon";
import { CreateNewParamSweepButton } from "./CreateNewParamSweepButton";
import { CreateNewVersionButton } from "./CreateNewVersionButton";
import { FreezeButton } from "./FreezeButton";
import { MultirunButton } from "./MultiRunButton";
import { SaveCustomArgumentsButton } from "./SaveCustomArgumentsButton";
function MenuButton({ sectionId, sectionTypeName }) {
  // hover:bg-setta-100 dark:hover:bg-setta-900
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
        padding={"p-1 mr-1"}
        rounded="rounded-full"
        triggerStyle={`${isSpecial ? "" : "h-3 w-3 text-setta-600 hover:text-white"} `}
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
