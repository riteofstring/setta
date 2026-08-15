import _ from "lodash";
import React, {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useShouldDisablePointerEvents } from "../../canvas/useShouldDisablePointerEvents";
import { openWorkspaceSectionMenu } from "../../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
  shouldRetainNativeContextMenu,
} from "../../context-menu/workspaceMenuOwnership";
import { useHasTempNested } from "../../dnd/useDndUtils";
import { getSectionOrThrow, GROUP_SECTION_KIND } from "../../document/documentSelectors";
import { useActiveSections, useWorkspaceDocument } from "../../document/stores";
import { ChangeOrientationButton } from "../header/ChangeOrientationButton";
import { DeleteOrHideButton } from "../header/DeleteOrHideButton";
import { LockPositionButton } from "../header/LockPositionButton";
import { MenuButton } from "../header/MenuButton";
import { SectionTitle } from "../header/SectionTitle";
import { getOnSectionClick } from "../sectionClick";
import { getOutlineColor } from "../sectionColors";
import { useSectionRefAndInit } from "../sectionRefs";

export type SectionDragListeners = React.HTMLAttributes<HTMLDivElement>;
export type SectionDragRef = (element: Element | null) => void;

// The reference's `ContainerCore`: the leaf wrapper div and the group chrome. A group paints
// its frame and selection outline on an absolutely positioned sibling layer, so selection never
// shifts group layout. The section element merges three ref systems (positional registry, dnd
// droppable, dnd draggable) and spreads the mode-gated drag listeners over its whole surface.
// The reference's overflow mode and view-mode props left with their owning features.
function ContainerComponent({
  isGroup,
  sectionId,
  droppableRef,
  draggableRef,
  className,
  style,
  trueDragListeners,
  children,
}: {
  isGroup: boolean;
  sectionId: string;
  droppableRef?: SectionDragRef;
  draggableRef?: SectionDragRef;
  className?: string;
  style?: CSSProperties;
  trueDragListeners?: SectionDragListeners;
  children: ReactNode;
}) {
  const refForPosition = useSectionRefAndInit(sectionId, "withNested");

  function totalRef(element: HTMLDivElement | null) {
    refForPosition.current = element;
    if (droppableRef) {
      droppableRef(element);
    }
    if (draggableRef) {
      draggableRef(element);
    }
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  return isGroup ? (
    <ContainerGroup
      sectionId={sectionId}
      commonProps={commonProps}
      className={className}
      style={style}
    >
      {children}
    </ContainerGroup>
  ) : (
    <div
      className={`${className ?? ""} focus-visible:outline-none`}
      style={style}
      {...commonProps}
      tabIndex={-1} // keeps section focusable for programmatic focus
    >
      {children}
    </div>
  );
}

export const Container = React.memo(ContainerComponent, _.isEqual);

type GroupCommonProps = SectionDragListeners & {
  ref: (element: HTMLDivElement | null) => void;
};

function ContainerGroup({
  sectionId,
  commonProps,
  className,
  style,
  children,
}: {
  sectionId: string;
  commonProps: GroupCommonProps;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const hasNested = useHasTempNested(sectionId);
  const section = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId));
  const positionAndSizeLocked = section.positionAndSizeLocked;
  const isActiveSection = useActiveSections((x) => x.activeIds.includes(sectionId));
  const disablePointerEvents = useShouldDisablePointerEvents();

  const outlineColor = getOutlineColor({ isActiveSection });
  const pointerSelectClassName = getPointerSelectClassName(disablePointerEvents);
  const outlineClassName = getGroupOutlineClassName(positionAndSizeLocked, outlineColor);

  // The reference activates sections through its app-level shortcut engine; the package keeps
  // keyboard activation on the group itself for the repository's accessibility gate. The group
  // role leaves its title and header buttons exposed to assistive technology.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && isWorkspaceMenuKeyboardEvent(event.nativeEvent)) {
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceSectionMenu(
        sectionId,
        "section",
        getOwnerKeyboardMenuPoint(event.currentTarget),
        event.currentTarget,
      );
      return;
    }
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      applyActiveSectionChange({ interaction: "section-click", sectionId });
    }
  }

  function onContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (shouldRetainNativeContextMenu(event.target, event.currentTarget)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openWorkspaceSectionMenu(
      sectionId,
      "section",
      { x: event.clientX, y: event.clientY },
      event.currentTarget,
    );
  }

  // This surface owns pointer and programmatic-focus activation without hiding its real controls.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={getGroupRootClassName(className)}
      {...commonProps}
      onClick={getOnSectionClick(sectionId)}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={`${section.name} group section${isActiveSection ? ", selected" : ""}`}
      aria-keyshortcuts="Enter Space Shift+F10 ContextMenu"
      tabIndex={-1} // keeps section focusable for programmatic focus
      style={style}
    >
      <div className={outlineClassName} />
      <GroupHeader sectionId={sectionId} pointerSelectClassName={pointerSelectClassName} />
      <div className="z-10">
        <EmptyGroupDropHint hasNested={hasNested} />
        {children}
      </div>
    </div>
  );
}

function getPointerSelectClassName(disablePointerEvents: boolean) {
  // Apply this only to the group title.
  // For sections, this is applied in SectionContainerCore.
  // We want to apply this lower down in the component tree, because dnd needs onPointerDown to work.
  return disablePointerEvents ? "pointer-events-none select-none" : "";
}

function getGroupRootClassName(className: string | undefined) {
  return `group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-2 focus-visible:outline-none ${className ?? ""}`;
}

function getGroupOutlineClassName(positionAndSizeLocked: boolean, outlineColor: string) {
  const lockClassName = positionAndSizeLocked
    ? "rounded-sm border-setta-400/90 dark:border-setta-975/35"
    : "rounded-3xl border-setta-50/50 dark:border-setta-700";
  return `outline outline-4 ${outlineColor} transition-radius absolute left-0 right-0 top-0 z-0 h-full w-full ${lockClassName}  border border-solid  bg-setta-100/40 outline outline-2 outline-transparent   dark:bg-setta-860/50`;
}

function GroupHeader({
  sectionId,
  pointerSelectClassName,
}: {
  sectionId: string;
  pointerSelectClassName: string;
}) {
  return (
    <div className="z-10 flex min-h-10 w-full items-center">
      <MenuButton sectionKind={GROUP_SECTION_KIND} hasSectionStyleTheme={false} />
      <div
        className={`${pointerSelectClassName} relative my-auto me-2 flex min-h-10 w-full items-center overflow-hidden`}
      >
        <GroupSectionTitle sectionId={sectionId} />
      </div>
      <div
        className="z-10 ms-auto flex items-center"
        data-setta-workspace-compact-control-group="true"
      >
        <ChangeOrientationButton sectionId={sectionId} />
        <LockPositionButton sectionId={sectionId} />
        <DeleteOrHideButton sectionId={sectionId} size="min-w-4 h-4 scale-150  " />
      </div>
    </div>
  );
}

function EmptyGroupDropHint({ hasNested }: { hasNested: boolean }) {
  if (hasNested) {
    return null;
  }
  return (
    <div className="z-10 -mx-4 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-sm text-setta-500/80 dark:border-setta-700 dark:text-setta-500">
      Drop A Section Here.
    </div>
  );
}

function GroupSectionTitle({ sectionId }: { sectionId: string }) {
  const titleProps = {
    editing:
      "nodrag cursor-text box-border px-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:border-blue-500 rounded-lg border border-solid border-transparent w-full tracking-tighter text-setta-500 dark:text-setta-500 flex-shrink",

    notEditing:
      "cursor-pointer box-border px-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:border-blue-500 rounded-lg border border-solid border-transparent w-full truncate tracking-tighter text-setta-500 dark:text-setta-500 flex-shrink",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
