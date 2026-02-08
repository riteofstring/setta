import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsListElement } from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";
import { HeaderIcon } from "../HeaderIcon";
import { AddArtifactByFilepath } from "./AddArtifactByFilepath";
import { ClearValues } from "./ClearValues";
import { CreateNewVariantButton } from "./CreateNewVariantButton";
import { HideColumn } from "./HideColumn";
import { HideShowParamsButton } from "./HideShowParamsButton";
import { HideShowUnpinnedParamsButton } from "./HideShowUnpinnedParamsButton";
import { ResetToDefaultVersion } from "./ResetToDefaultVersion";
import { ConvertFormat, RenderTextBlock } from "./ShowMarkdown";
import { ToggleGroupOverflowMode } from "./ToggleGroupOverflowMode";
import { ToggleHeadingAsSectionName } from "./ToggleHeadingAsSectionName";
import { ToggleMetaControlLook } from "./ToggleMetaControlLook";
import { UngroupButton } from "./UngroupButton";

function MenuButton({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
}) {
  const menuItems = getMenuItems(sectionTypeName);
  const isListElement = useIsListElement(sectionId);
  const textBlockMetaControlStyle = useProjectState((x) => {
    if (sectionTypeName !== SectionTypeEnum.TextBlock) {
      return false;
    }
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return impl.metaControlStyle;
  });

  const metaControlIconVisibilityClassName = textBlockMetaControlStyle
    ? "opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto"
    : "";
  const iconWrapperClassName = `nodrag w-[14px] h-[14px] flex cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500 ${metaControlIconVisibilityClassName}`;

  const unClickableIconWrapperClassName = `nodrag flex select-none items-center justify-center rounded-full ${!isListElement ? "p-0.5" : "ml-1 p-0.5"} mr-1 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 dark:text-setta-200 ${metaControlIconVisibilityClassName}`;

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
    case SectionTypeEnum.TextBlock:
      return [
        RenderTextBlock,
        ConvertFormat,
        ToggleHeadingAsSectionName,
        ToggleMetaControlLook,
        CreateNewVariantButton,
        ResetToDefaultVersion,
      ];
    case SectionTypeEnum.Callable:
      return [
        CreateNewVariantButton,
        HideShowParamsButton,
        HideShowUnpinnedParamsButton,
        ClearValues,
        ResetToDefaultVersion,
      ];
    case SectionTypeEnum.GlobalVariables:
    case SectionTypeEnum.Dict:
      return [
        CreateNewVariantButton,
        HideShowUnpinnedParamsButton,
        ClearValues,
        ResetToDefaultVersion,
      ];
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Code:
      return [CreateNewVariantButton, ResetToDefaultVersion];
    case SectionTypeEnum.Group:
      return [ToggleGroupOverflowMode, UngroupButton];
    case SectionTypeEnum.Draw:
    case SectionTypeEnum.Image:
    case SectionTypeEnum.Chart:
      return [AddArtifactByFilepath];
    case SectionTypeEnum.Browser:
      return [HideColumn];
    default:
      return [];
  }
}
