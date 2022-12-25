import { Button } from "./Button";

export function IconButton({
  twClasses = "",
  size = "w-3 h-3",
  padding = "py-1 px-1",
  bg = "bg-gray-50 hover:bg-gray-200",
  color = "text-gray-500",
  rounded = "rounded-full",
  icon,
  children,
  ...theRest
}) {
  return (
    <Button
      tailwindClasses={`${bg} ${color} ${rounded} ${padding} ${size} ${twClasses}`}
      {...theRest}
    >
      {icon}
      {children}
    </Button>
  );
}
