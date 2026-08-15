import { useRef } from "react";
import { openWorkspaceSectionMenu } from "../../context-menu/workspaceMenuInvocation";
import { getOwnerKeyboardMenuPoint } from "../../context-menu/workspaceMenuOwnership";
import { useWorkspaceMenuState } from "../../context-menu/workspaceMenuState";
import { GROUP_SECTION_KIND } from "../../document/documentSelectors";
import { HeaderIcon } from "./HeaderIcon";

// The reference's header `MenuButton`. A group gains the first package-owned header action here:
// the same section action menu used by context-menu and Outline invocations. Other kinds retain
// the accepted decorative icon until a later milestone gives them an applicable header action.
type MenuButtonProps = {
  sectionId: string;
  sectionKind: string;
  hasSectionStyleTheme: boolean;
};

function GroupMenuButton({
  className,
  hasSectionStyleTheme,
  sectionId,
}: {
  className: string;
  hasSectionStyleTheme: boolean;
  sectionId: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuInvocation = useWorkspaceMenuState((state) => state.invocation);
  const label = "Open group actions";
  return (
    <button
      aria-expanded={menuInvocation?.owner === triggerRef.current}
      aria-haspopup="menu"
      aria-label={label}
      className={`${className} cursor-pointer hover:bg-setta-100 focus-visible:ring-2 dark:hover:bg-setta-800`}
      data-setta-workspace-touch-target="compact"
      onClick={(event) => {
        openWorkspaceSectionMenu(
          sectionId,
          "section",
          getOwnerKeyboardMenuPoint(event.currentTarget),
          event.currentTarget,
        );
      }}
      ref={triggerRef}
      title={label}
      type="button"
    >
      <HeaderIcon sectionKind={GROUP_SECTION_KIND} hasSectionStyleTheme={hasSectionStyleTheme} />
    </button>
  );
}

export function MenuButton({ sectionId, sectionKind, hasSectionStyleTheme }: MenuButtonProps) {
  const unClickableIconWrapperClassName = hasSectionStyleTheme
    ? "nodrag flex select-none items-center justify-center rounded-full p-0.5 me-1 aspect-square font-semibold leading-none text-[color:var(--setta-section-style-muted-text)] outline-none motion-safe:transition-colors motion-safe:duration-150"
    : "nodrag flex select-none items-center justify-center rounded-full p-0.5 me-1 aspect-square font-semibold leading-none text-setta-700 outline-none motion-safe:transition-colors motion-safe:duration-150 dark:text-setta-200";

  if (sectionKind === GROUP_SECTION_KIND) {
    return (
      <GroupMenuButton
        className={unClickableIconWrapperClassName}
        hasSectionStyleTheme={hasSectionStyleTheme}
        sectionId={sectionId}
      />
    );
  }

  return (
    <div aria-hidden="true" className={unClickableIconWrapperClassName}>
      <HeaderIcon sectionKind={sectionKind} hasSectionStyleTheme={hasSectionStyleTheme} />
    </div>
  );
}
