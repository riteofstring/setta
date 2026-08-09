import type { KeyboardEvent, ReactNode } from "react";
import { applyActiveSectionChange } from "../../canvas/activeSectionController";
import { useShouldDisablePointerEvents } from "../../canvas/useShouldDisablePointerEvents";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { useActiveSections, useWorkspaceDocument } from "../../document/stores";
import { ChangeOrientationButton } from "../header/ChangeOrientationButton";
import { DeleteOrHideButton } from "../header/DeleteOrHideButton";
import { LockPositionButton } from "../header/LockPositionButton";
import { MenuButton } from "../header/MenuButton";
import { SectionTitle } from "../header/SectionTitle";
import { getOnSectionClick } from "../sectionClick";
import { getOutlineColor } from "../sectionColors";
import { useSectionRefAndInit } from "../sectionRefs";

// The reference's `ContainerCore`: the leaf wrapper div and the group chrome. A group paints
// its frame and selection outline on an absolutely positioned sibling layer, so selection never
// shifts group layout. The reference's overflow mode, view-mode props, and dnd ref/listener
// merging left with their owning features; the dnd batch reintroduces the drag wiring.
export function Container({
  isGroup,
  sectionId,
  children,
}: {
  isGroup: boolean;
  sectionId: string;
  children: ReactNode;
}) {
  const refForPosition = useSectionRefAndInit(sectionId, "withNested");

  if (isGroup) {
    return (
      <ContainerGroup sectionId={sectionId} refForPosition={refForPosition}>
        {children}
      </ContainerGroup>
    );
  }
  return (
    <div
      className="focus-visible:outline-none"
      ref={refForPosition}
      tabIndex={-1} // keeps section focusable for programmatic focus
    >
      {children}
    </div>
  );
}

function ContainerGroup({
  sectionId,
  refForPosition,
  children,
}: {
  sectionId: string;
  refForPosition: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const { positionAndSizeLocked, hasNested } = useWorkspaceDocument((x) => {
    const section = getSectionOrThrow(x, sectionId);
    return {
      positionAndSizeLocked: section.positionAndSizeLocked,
      hasNested: section.children.length > 0,
    };
  });
  const isActiveSection = useActiveSections((x) => x.activeIds.includes(sectionId));
  const disablePointerEvents = useShouldDisablePointerEvents();

  const outlineColor = getOutlineColor({ isActiveSection });
  const pointerSelectClassName = getPointerSelectClassName(disablePointerEvents);
  const outlineClassName = getGroupOutlineClassName(positionAndSizeLocked, outlineColor);

  // The reference activates sections through its app-level shortcut engine; the package keeps
  // keyboard activation on the group itself for the repository's accessibility gate.
  function onKeyDown(event: KeyboardEvent) {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      applyActiveSectionChange({ interaction: "section-click", sectionId });
    }
  }

  return (
    <div
      className={getGroupRootClassName()}
      ref={refForPosition}
      onClick={getOnSectionClick(sectionId)}
      onKeyDown={onKeyDown}
      role="button"
      aria-label="Group section"
      tabIndex={-1} // keeps section focusable for programmatic focus
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

function getGroupRootClassName() {
  return "group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-2 focus-visible:outline-none";
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
      <MenuButton isGroup hasSectionStyleTheme={false} />
      <div
        className={`${pointerSelectClassName} relative my-auto mr-2 flex min-h-10 w-full items-center overflow-hidden`}
      >
        <GroupSectionTitle sectionId={sectionId} />
      </div>
      <div className="z-10 ml-auto flex items-center">
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
