import { IoClose } from "react-icons/io5";
import { IconButton } from "utils/atoms/buttons/IconButton";

export function CustomCloseButton(props) {
  return (
    <IconButton
      {...props}
      icon={<IoClose />}
      color="text-slate-600 hover:text-white"
      bg="bg-transparent hover:bg-red-500"
      size="w-4 h-4"
      twClasses="absolute top-3 right-3 z-10"
    />
  );
}
