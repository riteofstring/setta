import { Button } from "./Button";

export function IconButton({
  twClasses = "",
  size = "w-3 h-3",
  padding = "py-1 px-1",
  bg = "bg-transparent hover:bg-setta-100 dark:hover:bg-setta-600",
  color = "text-setta-500",
  rounded = "rounded-full",
  icon,
  children,
  ref,
  ...theRest
}) {
  return (
    <Button
      twClasses={`flex justify-center ${bg} ${color} ${rounded} ${padding} ${size} ${twClasses}`}
      {...theRest}
      ref={ref}
      // grid={true}
    >
      {icon}
      {children}
    </Button>
  );
}
