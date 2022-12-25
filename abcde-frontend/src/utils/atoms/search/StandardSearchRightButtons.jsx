import { HiChevronDown, HiChevronRight, HiChevronUp } from "react-icons/hi";
import { IconButton } from "../buttons/IconButton";

export function DropdownButton({
  // simpleSearch,
  rounded,
  bg,
  size,
  toggleButtonProps,
  isOpen,
}) {
  return (
    <Btn
      rounded={rounded}
      bg={bg}
      size={size}
      isOpen={isOpen}
      icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
      {...toggleButtonProps}
    />
  );
}

export function GoButton({ simpleSearch, size }) {
  return (
    <Btn
      rounded={rounded}
      bg={bg}
      size={size}
      isOpen={isOpen}
      icon={<HiChevronRight />}
      {...toggleButtonProps}
    />
  );
}

function Btn({ rounded, bg, size, toggleButtonProps, isOpen }) {
  return (
    <IconButton
      rounded={rounded || "rounded-full"}
      bg={bg || "bg-transparent"}
      size={size || "w-10 h-10"}
      padding="p-0"
      grid={true}
      twClasses="absolute right-0 hover:bg-gray-100"
      {...toggleButtonProps}
      aria-label="toggle menu"
      icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
    />
  );
}
