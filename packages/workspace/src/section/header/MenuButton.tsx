import { HeaderIcon } from "./HeaderIcon";

// The reference's header `MenuButton`. Every menu item the reference offers here (variant,
// overflow-mode, ungroup, params visibility, artifact actions) belongs to features outside the
// slice, so the slice always renders the reference's unclickable icon-wrapper branch; the
// dropdown returns with the first feature that repopulates the menu.
type MenuButtonProps = {
  sectionKind: string;
  hasSectionStyleTheme: boolean;
};

export function MenuButton({ sectionKind, hasSectionStyleTheme }: MenuButtonProps) {
  const unClickableIconWrapperClassName = hasSectionStyleTheme
    ? "nodrag flex select-none items-center justify-center rounded-full p-0.5 me-1 aspect-square font-semibold leading-none text-[color:var(--setta-section-style-muted-text)] outline-none motion-safe:transition-colors motion-safe:duration-150"
    : "nodrag flex select-none items-center justify-center rounded-full p-0.5 me-1 aspect-square font-semibold leading-none text-setta-700 outline-none motion-safe:transition-colors motion-safe:duration-150 dark:text-setta-200";

  return (
    <div aria-hidden="true" className={unClickableIconWrapperClassName}>
      <HeaderIcon sectionKind={sectionKind} hasSectionStyleTheme={hasSectionStyleTheme} />
    </div>
  );
}
