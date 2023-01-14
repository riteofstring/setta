import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Item({ children, onClick }) {
  return (
    <DropdownMenu.Item
      className="flex flex-row items-center gap-2 hover:bg-gray-100 py-1 px-2 rounded-md font-body text-xs font-bold gray-700 outline-none focus-visible:ring-1 hover:ring-0 cursor-pointer"
      onClick={onClick}
    >
      {children}
    </DropdownMenu.Item>
  );
}
