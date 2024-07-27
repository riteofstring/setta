import { IconButton } from "utils/atoms/buttons/IconButton";

export function MinimizeButton({ twClasses, ...props }) {
  return (
    <IconButton
      {...props}
      icon={<i className="gg-math-minus" />}
      color="text-setta-600 hover:text-white"
      bg="bg-transparent hover:bg-blue-500"
      size="w-auto h-auto"
      padding="p-0"
      twClasses={twClasses}
      // onClick={onClick}
    />
  );
}
