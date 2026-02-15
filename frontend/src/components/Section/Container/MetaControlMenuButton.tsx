import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { BiCheck, BiHide, BiShow } from "react-icons/bi";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useIsListElement } from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import {
  route_set_meta_control_show_section_title,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  isBaseChildlessCodeObjImpl,
  type SectionType,
} from "utils/generatedTypes";
import { DeleteOrHideButton } from "../Header/DeleteOrHideButton";
import { HeaderIcon } from "../Header/HeaderIcon";
import { LockPositionButton } from "../Header/LockPositionButton";
import { SectionTitle } from "../Header/SectionTitle";

type MetaControlMenuButtonProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
};

export function MetaControlMenuButton({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
}: MetaControlMenuButtonProps) {
  const isListElement = useIsListElement(sectionId);
  const { showSectionTitle, timeControlParamId, isTimeDisplayMode } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImplOfType(
        x,
        sectionId,
        SectionTypeEnum.MetaControl,
      );
      const controlParamId = impl.metaControlParamId;
      if (!controlParamId) {
        return {
          showSectionTitle: impl.showSectionTitle ?? false,
          timeControlParamId: null,
          isTimeDisplayMode: false,
        };
      }
      const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
        x,
        sectionId,
        controlParamId,
        isBaseChildlessCodeObjImpl,
      );
      const isTimeTextParam =
        codeObjImpl.type === CodeObjTypeEnum.TextParam &&
        codeObjImpl.uiType === TextParamInputUITypeEnum.time;
      return {
        showSectionTitle: impl.showSectionTitle ?? false,
        timeControlParamId: isTimeTextParam ? controlParamId : null,
        isTimeDisplayMode: isTimeTextParam
          ? codeObjImpl.timeControlMode === TimeControlModeEnum.display
          : false,
      };
    });

  const triggerClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag flex h-[14px] w-[14px] cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500 opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto`;
  const titleBaseClasses =
    "block w-full min-w-0 max-w-full box-border rounded-md border border-solid border-transparent px-2 py-1 text-xs font-semibold leading-5 text-setta-700 focus-visible:border-blue-500 focus-visible:outline-none dark:text-setta-100";
  const titleProps = {
    editing: `${titleBaseClasses} bg-setta-100 dark:bg-setta-900/60`,
    notEditing: titleBaseClasses,
    fixed:
      "block w-full px-2 py-1 text-xs font-semibold text-setta-700 dark:text-setta-100",
  };

  function onToggleShowSectionTitle() {
    const nextValue = !showSectionTitle;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"MetaControlSection">(
          state,
          sectionId,
          {
            showSectionTitle: nextValue,
          },
        );
      },
      send: (frontendOpId) =>
        route_set_meta_control_show_section_title({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          showSectionTitle: nextValue,
          frontendOpId,
        }),
    });
  }

  function onToggleTimeControlMode() {
    if (!timeControlParamId) {
      return;
    }
    const nextMode = isTimeDisplayMode
      ? TimeControlModeEnum.input
      : TimeControlModeEnum.display;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"TextParamCodeObj">(
          state,
          sectionId,
          timeControlParamId,
          {
            timeControlMode: nextMode,
          },
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId: timeControlParamId,
          newConfig: {
            timeControlMode: nextMode,
          },
          frontendOpId,
        }),
    });
  }

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={triggerClassName} type="button">
        <HeaderIcon
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isListElement={isListElement}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50  dark:bg-setta-850"
          align="start"
          sideOffset={5}
          alignOffset={-3}
        >
          <div className="px-1 pb-1 pt-1">
            <SectionTitle sectionId={sectionId} titleProps={titleProps} />
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-setta-100 dark:bg-setta-700/70" />
          <DropdownMenuItem onClick={onToggleShowSectionTitle}>
            <span className="flex items-center gap-2">
              <MenuIcon>
                {showSectionTitle ? <BiCheck className="h-4 w-4" /> : null}
              </MenuIcon>
              <span>Show title</span>
            </span>
          </DropdownMenuItem>
          {timeControlParamId ? (
            <DropdownMenuItem onClick={onToggleTimeControlMode}>
              <span className="flex items-center gap-2">
                <MenuIcon>
                  {isTimeDisplayMode ? <BiCheck className="h-4 w-4" /> : null}
                </MenuIcon>
                <span>Time display mode</span>
              </span>
            </DropdownMenuItem>
          ) : null}
          <LockPositionButton
            sectionId={sectionId}
            render={({ positionAndSizeLocked, iconClassName, onClick }) => {
              let lockLabel = "Lock position";
              if (positionAndSizeLocked) {
                lockLabel = "Unlock position";
              }

              return (
                <DropdownMenuItem onClick={onClick}>
                  <span className="flex items-center gap-2">
                    <MenuIcon>
                      <i className={`${iconClassName} !scale-[.4]`} />
                    </MenuIcon>
                    <span>{lockLabel}</span>
                  </span>
                </DropdownMenuItem>
              );
            }}
          />
          <DeleteOrHideButton
            sectionId={sectionId}
            render={({ isEditingViewMode, visibility, onClick }) => {
              let closeLabel = "Close";
              let closeIcon = (
                <MenuIcon>
                  <i className="gg-close !scale-[.4]" />
                </MenuIcon>
              );
              if (isEditingViewMode) {
                if (visibility) {
                  closeLabel = "Hide";
                  closeIcon = (
                    <MenuIcon>
                      <BiShow className="h-4 w-4" />
                    </MenuIcon>
                  );
                } else {
                  closeLabel = "Show";
                  closeIcon = (
                    <MenuIcon>
                      <BiHide className="h-4 w-4" />
                    </MenuIcon>
                  );
                }
              }

              return (
                <DropdownMenuItem onClick={onClick}>
                  <span className="flex items-center gap-2">
                    {closeIcon}
                    <span>{closeLabel}</span>
                  </span>
                </DropdownMenuItem>
              );
            }}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DropdownMenuItem({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick();
      }}
      className={`group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100 ${className}`}
    >
      <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
        {children}
      </div>
    </DropdownMenu.Item>
  );
}

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 items-center justify-center">{children}</span>
  );
}
