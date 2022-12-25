import { IconButton } from "../buttons/IconButton";

export function StandardSearchRightBtn({
  rounded,
  bg,
  size,
  toggleButtonProps,
  icon,
}) {
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
      icon={icon}
    />
  );
}
