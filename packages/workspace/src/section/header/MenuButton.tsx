import { HeaderIcon } from "./HeaderIcon";

// The reference's header `MenuButton`. Every menu item the reference offers here (variant,
// overflow-mode, ungroup, params visibility, artifact actions) belongs to features outside the
// slice, so the slice always renders the reference's unclickable icon-wrapper branch; the
// dropdown returns with the first feature that repopulates the menu.
type MenuButtonProps = {
  isGroup: boolean;
  hasSectionStyleTheme: boolean;
};

export function MenuButton({ isGroup, hasSectionStyleTheme }: MenuButtonProps) {
  const unClickableIconWrapperClassName = hasSectionStyleTheme
    ? "nodrag flex select-none items-center justify-center rounded-full p-0.5 mr-1 aspect-square font-semibold leading-none text-[color:var(--setta-section-style-muted-text)] outline-none transition-colors duration-150"
    : "nodrag flex select-none items-center justify-center rounded-full p-0.5 mr-1 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 dark:text-setta-200";

  return (
    <div className={unClickableIconWrapperClassName}>
      <HeaderIcon isGroup={isGroup} hasSectionStyleTheme={hasSectionStyleTheme} />
    </div>
  );
}
