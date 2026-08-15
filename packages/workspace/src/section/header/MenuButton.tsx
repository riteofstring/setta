import { useRef } from "react";
import { openWorkspaceSectionHeaderMenu } from "../../context-menu/workspaceMenuInvocation";
import { getOwnerKeyboardMenuPoint } from "../../context-menu/workspaceMenuOwnership";
import { getWorkspaceMenuActions } from "../../context-menu/workspaceMenuRegistry";
import {
  closeWorkspaceMenu,
  useWorkspaceMenuState,
  type WorkspaceMenuInitialFocus,
} from "../../context-menu/workspaceMenuState";
import { GROUP_SECTION_KIND } from "../../document/documentSelectors";
import { HeaderIcon } from "./HeaderIcon";

// Frozen main makes the group icon a menu trigger for overflow and ungroup. The package additionally
// promotes a registered kind's icon when section-scoped host actions exist, as explicitly designed
// by A3. Kinds without either contribution keep the accepted decorative icon.
type MenuButtonProps = {
  sectionId: string;
  sectionKind: string;
  hasSectionStyleTheme: boolean;
};

function ActionMenuButton({
  className,
  hasSectionStyleTheme,
  sectionId,
  sectionKind,
}: {
  className: string;
  hasSectionStyleTheme: boolean;
  sectionId: string;
  sectionKind: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuInvocation = useWorkspaceMenuState((state) => state.invocation);
  const isOpen = menuInvocation?.owner === triggerRef.current;
  const label = sectionKind === GROUP_SECTION_KIND ? "Open group actions" : "Open section actions";

  function openMenu(initialFocus: WorkspaceMenuInitialFocus): void {
    const trigger = triggerRef.current;
    if (!trigger) {
      throw new Error(`Section action trigger ${sectionId} is not mounted.`);
    }
    openWorkspaceSectionHeaderMenu(
      sectionId,
      getOwnerKeyboardMenuPoint(trigger),
      trigger,
      initialFocus,
    );
  }

  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="menu"
      aria-label={label}
      className={`${className} cursor-pointer hover:bg-setta-100 focus-visible:ring-2 dark:hover:bg-setta-800`}
      data-setta-workspace-touch-target="compact"
      onClick={() => {
        if (isOpen) {
          closeWorkspaceMenu();
          return;
        }
        openMenu("first");
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openMenu(event.key === "ArrowUp" ? "last" : "first");
      }}
      ref={triggerRef}
      title={label}
      type="button"
    >
      <HeaderIcon sectionKind={sectionKind} hasSectionStyleTheme={hasSectionStyleTheme} />
    </button>
  );
}

export function MenuButton({ sectionId, sectionKind, hasSectionStyleTheme }: MenuButtonProps) {
  const unClickableIconWrapperClassName = hasSectionStyleTheme
    ? "nodrag flex select-none items-center justify-center rounded-full p-0.5 me-1 aspect-square font-semibold leading-none text-[color:var(--setta-section-style-muted-text)] outline-none motion-safe:transition-colors motion-safe:duration-150"
    : "nodrag flex select-none items-center justify-center rounded-full p-0.5 me-1 aspect-square font-semibold leading-none text-setta-700 outline-none motion-safe:transition-colors motion-safe:duration-150 dark:text-setta-200";

  const hasActions =
    sectionKind === GROUP_SECTION_KIND || getWorkspaceMenuActions("section").length > 0;
  if (hasActions) {
    return (
      <ActionMenuButton
        className={unClickableIconWrapperClassName}
        hasSectionStyleTheme={hasSectionStyleTheme}
        sectionId={sectionId}
        sectionKind={sectionKind}
      />
    );
  }

  return (
    <div aria-hidden="true" className={unClickableIconWrapperClassName}>
      <HeaderIcon sectionKind={sectionKind} hasSectionStyleTheme={hasSectionStyleTheme} />
    </div>
  );
}
