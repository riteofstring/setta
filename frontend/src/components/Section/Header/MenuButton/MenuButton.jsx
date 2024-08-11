import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import C from "constants/constants.json";
import { HeaderIcon } from "../HeaderIcon";
import { CreateNewParamSweepButton } from "./CreateNewParamSweepButton";
import { CreateNewVersionButton } from "./CreateNewVersionButton";
import { FreezeButton } from "./FreezeButton";
import { HideShowParamsButton } from "./HideShowParamsButton";
import { HideShowSearchButton } from "./HideShowSearchButton";
import { MultirunButton } from "./MultiRunButton";
import { SaveCustomArgumentsButton } from "./SaveCustomArgumentsButton";

function MenuButton({ sectionId, sectionTypeName }) {
  // hover:bg-setta-100 dark:hover:bg-setta-900

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
        {![C.PARAM_SWEEP, C.CODE, C.VAR_CONTROL].includes(sectionTypeName) && (
          <SaveCustomArgumentsButton sectionId={sectionId} />
        )}

        {sectionTypeName === C.PARAM_SWEEP ? (
          <CreateNewParamSweepButton sectionId={sectionId} />
        ) : (
          <CreateNewVersionButton sectionId={sectionId} />
        )}

        {![C.PARAM_SWEEP, C.CODE, C.VAR_CONTROL].includes(sectionTypeName) && (
          <MultirunButton sectionId={sectionId} />
        )}

        {[C.SECTION].includes(sectionTypeName) && (
          <HideShowSearchButton sectionId={sectionId} />
        )}

        {[C.SECTION].includes(sectionTypeName) && (
          <HideShowParamsButton sectionId={sectionId} />
        )}

        <FreezeButton sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
