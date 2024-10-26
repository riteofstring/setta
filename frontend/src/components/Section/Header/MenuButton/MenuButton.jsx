import * as Menubar from "@radix-ui/react-menubar";
import { getShiftTabBackToOverviewListItem } from "components/Panes/Overview/SectionListItems";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import C from "constants/constants.json";
import { useIsListElement } from "state/hooks/uiTypes";
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
        sectionId={sectionId}
      >
        {sectionTypeName === C.INFO && <ShowMarkdown sectionId={sectionId} />}

        {[C.SECTION, C.GLOBAL_VARIABLES].includes(sectionTypeName) && (
          <SaveCustomArgumentsButton sectionId={sectionId} />
        )}

        {sectionTypeName === C.PARAM_SWEEP && (
          <CreateNewParamSweepButton sectionId={sectionId} />
        )}

        {[
          C.SECTION,
          C.GLOBAL_VARIABLES,
          C.LIST_ROOT,
          C.DICT_ROOT,
          C.CODE,
          C.INTERACTIVE_CODE,
        ].includes(sectionTypeName) && (
          <CreateNewVersionButton sectionId={sectionId} />
        )}

        {[C.SECTION, C.GLOBAL_VARIABLES].includes(sectionTypeName) && (
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

function CardHeaderMenuButton({
  children,
  trigger,
  triggerClassName,
  sectionId,
}) {
  const isListElement = useIsListElement(sectionId);
  // the div id is used for tabbing
  const triggerDivId = `${sectionId}-MenuButtonTrigger`;

  return (
    <MenuDropdown
      triggerClassName={`nodrag flex cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500`}
      contentClassName="z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50  dark:bg-setta-850"
      contentAlign="start"
      contentSideOffset={5}
      contentAlignOffset={-3}
      trigger={trigger}
      triggerDivId={triggerDivId}
      triggerOnKeyDown={getShiftTabBackToOverviewListItem(sectionId)}
    >
      {children}
    </MenuDropdown>
  );
}
