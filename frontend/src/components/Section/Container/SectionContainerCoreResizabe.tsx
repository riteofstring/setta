import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CustomResizable } from "components/Utils/Resizable/CustomResizable";
import _ from "lodash";
import type { ReactNode } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import {
  dispatchOptimisticProjectStateUpdate,
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { getIsRoot } from "state/actions/uiTypes/utils";
import { useProjectState } from "state/definitions";
import { useIsListElement } from "state/hooks/uiTypes";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";
import {
  route_delete_sections,
  route_toggle_position_lock,
  route_toggle_section_visibility,
} from "utils/generatedEndpoints";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { HeaderIcon } from "../Header/HeaderIcon";
import { SectionHeader } from "../Header/SectionHeader";
import { SectionTitle } from "../Header/SectionTitle";
import { BrowserArea } from "../Layouts/BrowserArea";
import { CallableArea } from "../Layouts/CallableArea";
import { ChartArea } from "../Layouts/ChartArea/ChartArea";
import { ChatArea } from "../Layouts/ChatArea";
import { CodeArea, GenPythonCodeArea } from "../Layouts/CodeArea";
import { DictArea } from "../Layouts/DictArea";
import { DrawArea } from "../Layouts/DrawArea/DrawArea";
import { GlobalVariablesArea } from "../Layouts/GlobalVariablesArea";
import { IframeArea } from "../Layouts/IframeArea";
import { ImageArea } from "../Layouts/ImageArea";
import { MetaControlArea } from "../Layouts/MetaControlArea";
import { SocialArea } from "../Layouts/SocialArea";
import { TerminalArea } from "../Layouts/TerminalArea";
import { TextBlock } from "../Layouts/TextBlock";
import { Incrementer } from "../SectionParts/Incrementer";
import "./dndline.css";
import { getBgColor } from "./utils";

type SectionContainerCoreResizableProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
};

export function SectionContainerCoreResizable({
  sectionId,
  sectionTypeName,
  isActiveSection,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
}: SectionContainerCoreResizableProps) {
  const { isMinimized, isYouTube } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      isMinimized: impl.isMinimized,
      isYouTube: false,
      // isYouTube: getIsYouTubeSection(sectionId, x),
    };
  }, _.isEqual);

  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const isRoot = getIsRoot(sectionTypeName);
  const bgColor = getBgColor(sectionTypeName);
  const shouldRenderMetaMenu = isMetaControl && !isUserView;
  const metaControlFrameClassName = isMetaControl
    ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
    : undefined;
  const metaControlLayoutClassName = isMetaControl
    ? "grid-cols-1 grid-rows-1"
    : undefined;

  return (
    <CustomResizable
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      positionAndSizeLocked={positionAndSizeLocked}
      frameClassName={metaControlFrameClassName}
      layoutClassName={metaControlLayoutClassName}
    >
      {isMetaControl ? (
        shouldRenderMetaMenu && (
          <div className="absolute left-0 top-1/2 z-30 -translate-y-1/2">
            <div className="flex h-12 w-10 -translate-x-full items-center justify-end">
              <MetaControlMenuButton
                sectionId={sectionId}
                sectionTypeName={sectionTypeName}
                isInOtherProjectConfigs={isInOtherProjectConfigs}
              />
            </div>
          </div>
        )
      ) : (
        <SectionHeader
          sectionId={sectionId}
          isActiveSection={isActiveSection}
          sectionTypeName={sectionTypeName}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          isRoot={isRoot}
        />
      )}
      {isRoot && <Incrementer sectionId={sectionId} isRoot={isRoot} />}
      {!isMinimized && (
        <AreaSwitch
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          bgColor={bgColor}
        />
      )}
    </CustomResizable>
  );
}

function MetaControlMenuButton({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
}) {
  const isListElement = useIsListElement(sectionId);
  const { positionAndSizeLocked, isEditingViewMode, visibility } =
    useProjectState((state) => {
      const viewMode = getActiveViewModeConfig(state);
      const visibility = viewMode.visibilityBySectionId[sectionId];
      if (visibility === undefined) {
        throw new Error(
          `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
        );
      }
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      return {
        positionAndSizeLocked: impl.positionAndSizeLocked,
        isEditingViewMode: state.projectConfig.isEditingViewMode,
        visibility,
      };
    }, _.isEqual);

  const triggerClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag flex h-[14px] w-[14px] cursor-pointer select-none items-center justify-center rounded-full ${!isListElement ? "p-1" : "ml-1 p-0.5"} mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500 opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto`;
  let lockLabel = "Lock position";
  let lockIconClassName = "gg-lock-unlock";
  if (positionAndSizeLocked) {
    lockLabel = "Unlock position";
    lockIconClassName = "gg-lock";
  }
  const lockIcon = (
    <MenuIcon>
      <i className={`${lockIconClassName} !scale-[.4]`} />
    </MenuIcon>
  );
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
  const titleBaseClasses =
    "block w-full min-w-0 max-w-full box-border rounded-md border border-solid border-transparent px-2 py-1 text-xs font-semibold leading-5 text-setta-700 focus-visible:border-blue-500 focus-visible:outline-none dark:text-setta-100";
  const titleProps = {
    editing: `${titleBaseClasses} bg-setta-100 dark:bg-setta-900/60`,
    notEditing: titleBaseClasses,
    fixed:
      "block w-full px-2 py-1 text-xs font-semibold text-setta-700 dark:text-setta-100",
  };

  function onToggleLock() {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const section = state.sections[sectionId];
        if (!section) {
          return;
        }
        section.positionAndSizeLocked = !section.positionAndSizeLocked;
      },
      send: (frontendOpId) =>
        route_toggle_position_lock({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          frontendOpId,
        }),
    });
  }

  function onClose() {
    if (isEditingViewMode) {
      route_toggle_section_visibility({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: [sectionId],
      });
      return;
    }
    route_delete_sections({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: [sectionId],
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
          <DropdownMenuItem onClick={onToggleLock}>
            <span className="flex items-center gap-2">
              {lockIcon}
              <span>{lockLabel}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClose}>
            <span className="flex items-center gap-2">
              {closeIcon}
              <span>{closeLabel}</span>
            </span>
          </DropdownMenuItem>
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

function AreaSwitch({
  sectionId,
  sectionTypeName,
  bgColor,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
}) {
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
      return <CallableArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Dict:
      return <DictArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Image:
      return <ImageArea sectionId={sectionId} />;
    case SectionTypeEnum.Chart:
      return <ChartArea sectionId={sectionId} />;
    case SectionTypeEnum.Draw:
      return <DrawArea sectionId={sectionId} />;
    case SectionTypeEnum.Social:
      return <SocialArea sectionId={sectionId} />;
    case SectionTypeEnum.TextBlock:
      return <TextBlock sectionId={sectionId} />;
    case SectionTypeEnum.MetaControl:
      return <MetaControlArea sectionId={sectionId} />;
    case SectionTypeEnum.GlobalVariables:
      return <GlobalVariablesArea sectionId={sectionId} bgColor={bgColor} />;
    case SectionTypeEnum.Code:
      return <CodeArea sectionId={sectionId} />;
    case SectionTypeEnum.GenPythonCode:
      return <GenPythonCodeArea sectionId={sectionId} />;
    case SectionTypeEnum.Terminal:
      return <TerminalArea sectionId={sectionId} />;
    case SectionTypeEnum.IFrame:
      return <IframeArea sectionId={sectionId} />;
    case SectionTypeEnum.Chat:
      return <ChatArea sectionId={sectionId} />;
    case SectionTypeEnum.Browser:
      return <BrowserArea sectionId={sectionId} />;
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Group:
      return null;
    default:
      return sectionTypeName satisfies never;
  }
}
