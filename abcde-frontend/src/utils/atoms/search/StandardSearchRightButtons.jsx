import { HiChevronDown, HiChevronRight, HiChevronUp } from "react-icons/hi";
import { IconButton } from "../buttons/IconButton";

export function DropdownButton({
  simpleSearch,
  size,
  toggleButtonProps,
  isOpen,
}) {
  return (
    <IconButton
      rounded={!simpleSearch ? "rounded-full" : "rounded-2xl"}
      bg={!simpleSearch ? "bg-white" : "bg-transparent"}
      size={size}
      padding="p-0"
      grid={true}
      twClasses="absolute right-0 hover:bg-gray-100"
      {...toggleButtonProps}
      aria-label="toggle menu"
      icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
    />
  );
}

export function GoButton({ simpleSearch, size }) {
  return (
    <IconButton
      rounded={!simpleSearch ? "rounded-full" : "rounded-2xl"}
      bg={!simpleSearch ? "bg-white" : "bg-transparent"}
      size={size}
      padding="p-0"
      grid={true}
      twClasses="absolute right-0 hover:bg-gray-100"
      aria-label={"toggle menu"}
      icon={<HiChevronRight />}
    />
  );
}
