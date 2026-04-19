import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import { isCanvasOwnedSectionLightweightMenuTrigger } from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { toggleMinimized } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import type { ReactNode } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsListElement } from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import { type SectionType } from "utils/generatedTypes";
import { DeleteOrHideButton } from "../Header/DeleteOrHideButton";
import { HeaderIcon } from "../Header/HeaderIcon";
import { LockPositionButton } from "../Header/LockPositionButton";
import { CreateNewVariantButton } from "../Header/MenuButton/CreateNewVariantButton";
import { ResetToDefaultVersion } from "../Header/MenuButton/ResetToDefaultVersion";
import {
  ConvertFormat,
  RenderTextBlock,
} from "../Header/MenuButton/ShowMarkdown";
import { ToggleHeadingAsSectionName } from "../Header/MenuButton/ToggleHeadingAsSectionName";
import { ToggleMetaControlLook } from "../Header/MenuButton/ToggleMetaControlLook";
import { SectionTitle } from "../Header/SectionTitle";
type TextBlockMetaControlMenuButtonProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isRoot: boolean;
};
export function TextBlockMetaControlMenuButton({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isRoot,
}: TextBlockMetaControlMenuButtonProps) {
  const isListElement = useIsListElement(sectionId);
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const triggerClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag flex h-[14px] w-[14px] cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500 opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto`;
  const lightweightMenuTrigger =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionLightweightMenuTrigger(sectionId);
  const titleBaseClasses =
    "block w-full min-w-0 max-w-full box-border rounded-md border border-solid border-transparent px-2 py-1 text-xs font-semibold leading-5 text-setta-700 focus-visible:border-blue-500 focus-visible:outline-none dark:text-setta-100";
  const titleProps = {
    editing: `${titleBaseClasses} bg-setta-100 dark:bg-setta-900/60`,
    notEditing: titleBaseClasses,
    fixed:
      "block w-full px-2 py-1 text-xs font-semibold text-setta-700 dark:text-setta-100",
  };
  return (
    <Menubar.Root className={SETTA_PREVENT_SECTION_ACTIVE_CSS}>
      <MenuDropdown
        triggerClassName={triggerClassName}
        triggerAsChild={lightweightMenuTrigger}
        triggerWrapperProps={
          lightweightMenuTrigger
            ? {
                "data-canvas-owned-lightweight-menu-trigger": "true",
              }
            : undefined
        }
        contentClassName="z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50  dark:bg-setta-850"
        contentAlign="start"
        contentSideOffset={5}
        contentAlignOffset={-3}
        trigger={
          <HeaderIcon
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
            isListElement={isListElement}
          />
        }
      >
        <div className="px-1 pb-1 pt-1">
          <SectionTitle sectionId={sectionId} titleProps={titleProps} />
        </div>
        <Menubar.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/70" />
        <RenderTextBlock sectionId={sectionId} />
        <ConvertFormat sectionId={sectionId} />
        <ToggleHeadingAsSectionName sectionId={sectionId} />
        <ToggleMetaControlLook sectionId={sectionId} />
        <CreateNewVariantButton sectionId={sectionId} />
        <ResetToDefaultVersion sectionId={sectionId} />
        <Menubar.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/70" />
        <LockPositionMenuItem sectionId={sectionId} />
        {!isRoot && <MinimizeMenuItem sectionId={sectionId} />}
        <DeleteOrHideMenuItem sectionId={sectionId} />
      </MenuDropdown>
    </Menubar.Root>
  );
}
function LockPositionMenuItem({ sectionId }: { sectionId: string }) {
  return (
    <LockPositionButton
      sectionId={sectionId}
      render={({ positionAndSizeLocked, iconClassName, onClick }) => {
        const label = positionAndSizeLocked
          ? "Unlock position"
          : "Lock position";
        return (
          <MenuItem onClick={onClick}>
            <span className="flex items-center gap-2">
              <MenuIcon>
                <i className={`${iconClassName} !scale-[.4]`} />
              </MenuIcon>
              <span>{label}</span>
            </span>
          </MenuItem>
        );
      }}
    />
  );
}
function MinimizeMenuItem({ sectionId }: { sectionId: string }) {
  const isMinimized = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.isMinimized;
  });
  function onClick() {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        setCurrEffectiveSectionImplValue(state, sectionId, {
          isMinimized: !impl.isMinimized,
        });
      },
      send: (frontendOpId) =>
        callOpenAPI(
          toggleMinimized({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              frontendOpId,
            },
          } as Parameters<typeof toggleMinimized>[0]),
        ),
    });
  }
  const label = isMinimized ? "Expand" : "Minimize";
  const iconClassName = isMinimized
    ? "gg-maximize !scale-[.4]"
    : "gg-math-minus";
  return (
    <MenuItem onClick={onClick}>
      <span className="flex items-center gap-2">
        <MenuIcon>
          <i className={iconClassName} />
        </MenuIcon>
        <span>{label}</span>
      </span>
    </MenuItem>
  );
}
function DeleteOrHideMenuItem({ sectionId }: { sectionId: string }) {
  return (
    <DeleteOrHideButton
      sectionId={sectionId}
      render={({ label, icon, onClick }) => (
        <MenuItem onClick={onClick}>
          <span className="flex items-center gap-2">
            <MenuIcon>{icon}</MenuIcon>
            <span>{label}</span>
          </span>
        </MenuItem>
      )}
    />
  );
}
function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 items-center justify-center">{children}</span>
  );
}
