import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Item({ children, onClick }) {
  return (
    <DropdownMenu.Item
      className="text-xs font-bold text-gray-700 flex flex-row items-center gap-2 px-2 py-1 hover:bg-gray-200 rounded-md cursor-pointer font-body"
      onClick={onClick}
    >
      {children}
    </DropdownMenu.Item>
  );
}
