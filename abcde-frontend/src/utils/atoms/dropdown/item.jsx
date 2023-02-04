import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Item({ children, onClick }) {
  return (
    <DropdownMenu.Item
      className="gray-700 flex cursor-pointer flex-row items-center gap-2 rounded-md py-1 px-2 font-body text-xs font-bold outline-none hover:bg-slate-100 hover:ring-0 focus-visible:ring-1"
      onClick={onClick}
    >
      {children}
    </DropdownMenu.Item>
  );
}
