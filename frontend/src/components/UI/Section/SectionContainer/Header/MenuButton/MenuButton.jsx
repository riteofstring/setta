import * as Menubar from "@radix-ui/react-menubar";
import { useGetSectionType } from "hooks/useSectionType";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { CODE, PARAM_SWEEP, TERMINAL, VAR_CONTROL } from "z_utils/constants";
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

  return (
    <Menubar.Root>
      <MenuDropdown
        padding={sectionTypeName === CODE || TERMINAL ? "p-1 mx-1" : "p-1"}
        rounded="rounded-full"
        triggerStyle={
          sectionTypeName === CODE || TERMINAL
            ? ""
            : "ml-2 h-3 w-3 text-runcoder-600 hover:text-white"
        }
        // trigger={
        //   <i className="gg-menu text-runcoder-300 dark:text-runcoder-500" />
        // }
        trigger={
          sectionTypeName === CODE || TERMINAL ? (
            <HeaderIcon
              sectionId={sectionId}
              sectionTypeName={sectionTypeName}
              classes="text-runcoder-400/50 dark:text-runcoder-400/50 "
            />
          ) : (
            <i className="gg-menu text-runcoder-300 dark:text-runcoder-500" />
          )
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
