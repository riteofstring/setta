import * as Menubar from "@radix-ui/react-menubar";
import type {
  ComponentPropsWithoutRef,
  KeyboardEventHandler,
  PropsWithChildren,
  ReactNode,
} from "react";
import { APP_MENU_Z_INDEX_CLASS_NAME } from "utils/constants";

type MenubarContentProps = ComponentPropsWithoutRef<typeof Menubar.Content>;

type MenuDropdownProps = PropsWithChildren<{
  trigger: ReactNode;
  triggerClassName?: string | undefined;
  contentClassName: string;
  contentAlign: NonNullable<MenubarContentProps["align"]>;
  contentSideOffset: number;
  contentAlignOffset: number;
  tabIndex?: number | undefined;
  triggerOnKeyDown?: KeyboardEventHandler<HTMLButtonElement> | undefined;
}>;

export function MenuDropdown({
  trigger,
  triggerClassName,
  contentClassName,
  contentAlign,
  contentSideOffset,
  contentAlignOffset,
  tabIndex,
  children,
  triggerOnKeyDown,
}: MenuDropdownProps) {
  return (
    <Menubar.Menu>
      <Menubar.Trigger
        className={triggerClassName}
        tabIndex={tabIndex}
        onKeyDown={triggerOnKeyDown}
      >
        {trigger}
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content
          className={contentClassName}
          align={contentAlign}
          sideOffset={contentSideOffset}
          alignOffset={contentAlignOffset}
        >
          {children}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}

export function NavbarMenuDropdown({
  children,
  trigger,
  tabIndex,
  triggerClassName = "nodrag flex cursor-pointer select-none items-center justify-between gap-1 rounded-md py-1 px-2 text-xs font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800",
  contentClassName = `${APP_MENU_Z_INDEX_CLASS_NAME} min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850`,
}: PropsWithChildren<{
  trigger: ReactNode;
  tabIndex?: number | undefined;
  triggerClassName?: string | undefined;
  contentClassName?: string | undefined;
}>) {
  return (
    <MenuDropdown
      triggerClassName={triggerClassName}
      contentClassName={contentClassName}
      contentAlign="start"
      contentSideOffset={5}
      contentAlignOffset={-3}
      trigger={trigger}
      tabIndex={tabIndex}
    >
      {children}
    </MenuDropdown>
  );
}
