import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Item({ children, onClick }) {
  return (
    <DropdownMenu.Item
      className="text-sm flex flex-row gap-1"
      onClick={onClick}
    >
      {children}
    </DropdownMenu.Item>
  );
}
