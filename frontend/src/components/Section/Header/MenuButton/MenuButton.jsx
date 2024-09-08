import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import C from "constants/constants.json";
import { HeaderIcon } from "../HeaderIcon";
import { CreateNewParamSweepButton } from "./CreateNewParamSweepButton";
import { CreateNewVersionButton } from "./CreateNewVersionButton";
import { FreezeButton } from "./FreezeButton";
import { HideShowParamsButton } from "./HideShowParamsButton";
import { HideShowSearchButton } from "./HideShowSearchButton";
import { HideShowUnpinnedParamsButton } from "./HideShowUnpinnedParamsButton";
import { MultirunButton } from "./MultiRunButton";
import { SaveCustomArgumentsButton } from "./SaveCustomArgumentsButton";
import { ShowMarkdown } from "./ShowMarkdown";
import { ShowYaml } from "./ShowYaml";

function MenuButton({ sectionId, sectionTypeName, isInOtherProjectConfigs }) {
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
      <CardHeaderMenuButton
        triggerStyle={`${isSpecial ? "" : "h-3 w-3 text-setta-600 hover:text-white"} `}
        trigger={
          <HeaderIcon
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
          />
        }
      >
        {sectionTypeName === C.INFO && <ShowMarkdown sectionId={sectionId} />}

        {![C.PARAM_SWEEP, C.CODE, C.INFO].includes(sectionTypeName) && (
          <SaveCustomArgumentsButton sectionId={sectionId} />
        )}

        {sectionTypeName === C.PARAM_SWEEP ? (
          <CreateNewParamSweepButton sectionId={sectionId} />
        ) : (
          <CreateNewVersionButton sectionId={sectionId} />
        )}

        {![C.PARAM_SWEEP, C.CODE, C.INFO].includes(sectionTypeName) && (
          <MultirunButton sectionId={sectionId} />
        )}

        {[C.SECTION].includes(sectionTypeName) && (
          <HideShowSearchButton sectionId={sectionId} />
        )}

        {[C.SECTION].includes(sectionTypeName) && (
          <HideShowParamsButton sectionId={sectionId} />
        )}

        {[C.SECTION, C.GLOBAL_VARIABLES].includes(sectionTypeName) && (
          <HideShowUnpinnedParamsButton sectionId={sectionId} />
        )}

        {[C.SECTION, C.GLOBAL_VARIABLES].includes(sectionTypeName) && (
          <ShowYaml sectionId={sectionId} />
        )}

        <FreezeButton sectionId={sectionId} />
      </CardHeaderMenuButton>
    </Menubar.Root>
  );
}

export default MenuButton;

function CardHeaderMenuButton({ children, trigger }) {
  return (
    <MenuDropdown
      triggerClassName="nodrag flex cursor-pointer select-none items-center justify-center rounded-full p-1 mr-1 aspect-square text-xs font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800"
      contentClassName="z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50  dark:bg-setta-850"
      contentAlign="start"
      contentSideOffset={5}
      contentAlignOffset={-3}
      trigger={trigger}
    >
      {children}
    </MenuDropdown>
  );
}
