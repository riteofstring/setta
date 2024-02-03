import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Item({ children, onClick, onMouseOver }) {
  return (
    <DropdownMenu.Item
      className="flex cursor-pointer flex-row items-center gap-2 rounded-md px-2 py-1 font-sans text-xs font-semibold text-runcoder-700 outline-none hover:bg-runcoder-100 hover:ring-0 focus-visible:ring-1 dark:text-runcoder-100 dark:hover:bg-runcoder-900"
      onClick={onClick}
      onMouseOver={onMouseOver}
    >
      {children}
    </DropdownMenu.Item>
  );
}
