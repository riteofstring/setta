import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Menubar from "@radix-ui/react-menubar";
import { createContext, type ReactNode, useContext } from "react";

type MenuItemPrimitiveVariant = "menubar" | "dropdown";

const MenuItemPrimitiveContext =
  createContext<MenuItemPrimitiveVariant>("menubar");

const MENU_ITEM_CLASS_NAME =
  "group relative flex h-[25px] cursor-pointer select-none items-center rounded text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100";
const MENU_ITEM_CONTENT_CLASS_NAME =
  "flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white";
const MENU_ITEM_RIGHT_SLOT_CLASS_NAME =
  "ml-auto pl-5 tracking-tight text-setta-400 group-data-[disabled]:text-setta-300 group-data-[highlighted]:text-white dark:group-data-[disabled]:text-setta-500 dark:group-data-[highlighted]:text-setta-100";

export function MenuItemPrimitiveProvider({
  children,
  variant,
}: {
  children: ReactNode;
  variant: MenuItemPrimitiveVariant;
}) {
  return (
    <MenuItemPrimitiveContext.Provider value={variant}>
      {children}
    </MenuItemPrimitiveContext.Provider>
  );
}

export function MenuItem({
  children,
  shortcut = "",
  onClick = () => {},
  disabled = false,
  className = "",
  paddingClassName = "px-[10px]",
}: {
  children: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  paddingClassName?: string;
}) {
  const variant = useContext(MenuItemPrimitiveContext);
  const resolvedClassName = `${MENU_ITEM_CLASS_NAME} ${paddingClassName} ${className}`;
  const itemContent = (
    <>
      <div className={MENU_ITEM_CONTENT_CLASS_NAME}>{children}</div>
      <div className={MENU_ITEM_RIGHT_SLOT_CLASS_NAME}>{shortcut}</div>
    </>
  );
  const onSelect = (event: Event) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick();
  };

  if (variant === "dropdown") {
    return (
      <DropdownMenu.Item
        disabled={disabled}
        onSelect={onSelect}
        className={resolvedClassName}
      >
        {itemContent}
      </DropdownMenu.Item>
    );
  }

  return (
    <Menubar.Item
      disabled={disabled}
      onSelect={onSelect}
      className={resolvedClassName}
    >
      {itemContent}
    </Menubar.Item>
  );
}

export function MenuSubTrigger({
  children,
  rightSlot = ">",
  disabled = false,
  className = "",
  paddingClassName = "px-[10px]",
}: {
  children: ReactNode;
  rightSlot?: ReactNode;
  disabled?: boolean;
  className?: string;
  paddingClassName?: string;
}) {
  const variant = useContext(MenuItemPrimitiveContext);
  const resolvedClassName = `${MENU_ITEM_CLASS_NAME} ${paddingClassName} ${className}`;
  const itemContent = (
    <>
      <div className={MENU_ITEM_CONTENT_CLASS_NAME}>{children}</div>
      <div className={MENU_ITEM_RIGHT_SLOT_CLASS_NAME}>{rightSlot}</div>
    </>
  );

  if (variant === "dropdown") {
    return (
      <DropdownMenu.SubTrigger
        disabled={disabled}
        className={resolvedClassName}
      >
        {itemContent}
      </DropdownMenu.SubTrigger>
    );
  }

  return (
    <Menubar.SubTrigger disabled={disabled} className={resolvedClassName}>
      {itemContent}
    </Menubar.SubTrigger>
  );
}
