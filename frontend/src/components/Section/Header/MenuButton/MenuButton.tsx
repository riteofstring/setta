import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { useIsListElement } from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import { HeaderIcon } from "../HeaderIcon";
import { AddArtifactByFilepath } from "./AddArtifactByFilepath";
import { ClearValues } from "./ClearValues";
import { CreateNewVersionButton } from "./CreateNewVersionButton";
import { HideColumn } from "./HideColumn";
import { HideShowParamsButton } from "./HideShowParamsButton";
import { HideShowSearchButton } from "./HideShowSearchButton";
import { HideShowUnpinnedParamsButton } from "./HideShowUnpinnedParamsButton";
import { ResetToDefaultVersion } from "./ResetToDefaultVersion";
import { ConvertFormat, RenderTextBlock } from "./ShowMarkdown";
import { ShowYaml } from "./ShowYaml";
import { UngroupButton } from "./UngroupButton";

function MenuButton({ sectionId, sectionTypeName, isInOtherProjectConfigs }) {
  const menuItems = getMenuItems(sectionTypeName);
  const isListElement = useIsListElement(sectionId);

  const iconWrapperClassName = `nodrag w-[14px] h-[14px] flex cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500`;

  const unClickableIconWrapperClassName = `nodrag flex select-none items-center justify-center rounded-full ${!isListElement ? "p-0.5" : "ml-1 p-0.5"} mr-1 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 dark:text-setta-200`;

  if (menuItems.length === 0) {
    return (
      <div className={unClickableIconWrapperClassName}>
        <HeaderIcon
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isListElement={isListElement}
        />
      </div>
    );
  }

  return (
    <Menubar.Root className={SETTA_PREVENT_SECTION_ACTIVE_CSS}>
      <CardHeaderMenuButton
        triggerClassName={iconWrapperClassName}
        trigger={
          <HeaderIcon
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
            isListElement={isListElement}
          />
        }
      >
        {menuItems.map((Component, idx) => (
          <Component sectionId={sectionId} key={idx} />
        ))}
      </CardHeaderMenuButton>
    </Menubar.Root>
  );
}

export default MenuButton;

function CardHeaderMenuButton({ children, trigger, triggerClassName }) {
  return (
    <MenuDropdown
      triggerClassName={triggerClassName}
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

function getMenuItems(uiTypeName) {
  switch (uiTypeName) {
    case UITypeNameEnum.TEXT_BLOCK:
      return [
        RenderTextBlock,
        ConvertFormat,
        CreateNewVersionButton,
        ResetToDefaultVersion,
      ];
    case UITypeNameEnum.SECTION:
      return [
        CreateNewVersionButton,
        HideShowSearchButton,
        HideShowParamsButton,
        HideShowUnpinnedParamsButton,
        ShowYaml,
        ClearValues,
        ResetToDefaultVersion,
      ];
    case UITypeNameEnum.GLOBAL_VARIABLES:
      return [
        CreateNewVersionButton,
        HideShowUnpinnedParamsButton,
        ShowYaml,
        ClearValues,
        ResetToDefaultVersion,
      ];
    case UITypeNameEnum.LIST_ROOT:
    case UITypeNameEnum.DICT_ROOT:
    case UITypeNameEnum.CODE:
      return [CreateNewVersionButton, ResetToDefaultVersion];
    case UITypeNameEnum.GROUP:
      return [UngroupButton];
    case UITypeNameEnum.DRAW:
    case UITypeNameEnum.IMAGE:
    case UITypeNameEnum.CHART:
      return [AddArtifactByFilepath];
    case UITypeNameEnum.BROWSER:
      return [HideColumn];
    default:
      return [];
  }
}
