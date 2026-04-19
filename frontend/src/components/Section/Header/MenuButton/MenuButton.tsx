import * as Menubar from "@radix-ui/react-menubar";
import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import {
  isCanvasOwnedSectionLightweightMenuTrigger,
  isCanvasOwnedSectionMotionHiddenBody,
} from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { useReactFlow } from "forks/xyflow/core/store";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import type { ComponentType } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
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

type MenuItemComponent = ComponentType<{ sectionId: string }>;

const EMPTY_MENU_ITEMS: readonly MenuItemComponent[] = [];

const MENU_ITEMS_BY_SECTION_TYPE: Partial<
  Record<SectionType, readonly MenuItemComponent[]>
> = {
  [SectionTypeEnum.TextBlock]: [
    RenderTextBlock,
    ConvertFormat,
    ToggleHeadingAsSectionName,
    ToggleMetaControlLook,
    CreateNewVariantButton,
    ResetToDefaultVersion,
  ],
  [SectionTypeEnum.Callable]: [
    CreateNewVariantButton,
    HideShowParamsButton,
    HideShowUnpinnedParamsButton,
    ClearValues,
    ResetToDefaultVersion,
  ],
  [SectionTypeEnum.GlobalVariables]: [
    CreateNewVariantButton,
    HideShowUnpinnedParamsButton,
    ClearValues,
    ResetToDefaultVersion,
  ],
  [SectionTypeEnum.Dict]: [
    CreateNewVariantButton,
    HideShowUnpinnedParamsButton,
    ClearValues,
    ResetToDefaultVersion,
  ],
  [SectionTypeEnum.ListRoot]: [CreateNewVariantButton, ResetToDefaultVersion],
  [SectionTypeEnum.Code]: [CreateNewVariantButton, ResetToDefaultVersion],
  [SectionTypeEnum.Group]: [ToggleGroupOverflowMode, UngroupButton],
  [SectionTypeEnum.Draw]: [AddArtifactByFilepath],
  [SectionTypeEnum.Image]: [AddArtifactByFilepath],
  [SectionTypeEnum.Chart]: [AddArtifactByFilepath],
  [SectionTypeEnum.Browser]: [HideColumn],
};

function MenuButton({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  hasSectionStyleTheme: boolean;
}) {
  const menuItems = getMenuItems(sectionTypeName);
  const isListElement = useIsListElement(sectionId);
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
  const isSectionUIActive = useIsSectionUIActive(sectionId);
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
  const iconWrapperClassName = hasSectionStyleTheme
    ? `nodrag w-[14px] h-[14px] flex cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-[color:var(--setta-section-style-muted-text)] outline-none transition-colors duration-150 hover:bg-setta-100 hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-2 focus-visible:ring-[var(--setta-section-style-outline)] dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-[color:var(--setta-section-style-outline)] ${metaControlIconVisibilityClassName}`
    : `nodrag w-[14px] h-[14px] flex cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500 ${metaControlIconVisibilityClassName}`;

  const unClickableIconWrapperClassName = hasSectionStyleTheme
    ? `nodrag flex select-none items-center justify-center rounded-full ${!isListElement ? "p-0.5" : "ml-1 p-0.5"} mr-1 aspect-square font-semibold leading-none text-[color:var(--setta-section-style-muted-text)] outline-none transition-colors duration-150 ${metaControlIconVisibilityClassName}`
    : `nodrag flex select-none items-center justify-center rounded-full ${!isListElement ? "p-0.5" : "ml-1 p-0.5"} mr-1 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 dark:text-setta-200 ${metaControlIconVisibilityClassName}`;
  const lightweightMenuTrigger =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionLightweightMenuTrigger(sectionId);
  const motionHiddenMenuTrigger =
    lightweightMenuTrigger &&
    viewportInteractionActive &&
    !isSectionUIActive &&
    isCanvasOwnedSectionMotionHiddenBody(sectionId);

  if (menuItems.length === 0) {
    return (
      <div className={unClickableIconWrapperClassName}>
        <HeaderIcon
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isListElement={isListElement}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      </div>
    );
  }

  return (
    <Menubar.Root className={SETTA_PREVENT_SECTION_ACTIVE_CSS}>
      <CardHeaderMenuButton
        lightweightMenuTrigger={lightweightMenuTrigger}
        motionHiddenMenuTrigger={motionHiddenMenuTrigger}
        triggerClassName={iconWrapperClassName}
        trigger={
          <HeaderIcon
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
            isListElement={isListElement}
            hasSectionStyleTheme={hasSectionStyleTheme}
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

function CardHeaderMenuButton({
  children,
  lightweightMenuTrigger,
  motionHiddenMenuTrigger,
  trigger,
  triggerClassName,
}) {
  return (
    <MenuDropdown
      triggerClassName={`${triggerClassName}${motionHiddenMenuTrigger ? " invisible pointer-events-none" : ""}`}
      triggerAsChild={lightweightMenuTrigger}
      triggerWrapperProps={
        lightweightMenuTrigger
          ? {
              "data-canvas-owned-lightweight-menu-trigger": "true",
              "data-canvas-owned-motion-menu-trigger-hidden":
                motionHiddenMenuTrigger ? "true" : undefined,
            }
          : undefined
      }
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

function getMenuItems(uiTypeName: SectionType): readonly MenuItemComponent[] {
  return MENU_ITEMS_BY_SECTION_TYPE[uiTypeName] ?? EMPTY_MENU_ITEMS;
}
