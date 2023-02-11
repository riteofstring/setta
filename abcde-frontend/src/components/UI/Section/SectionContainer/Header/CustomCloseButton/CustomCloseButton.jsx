import { IoClose } from "react-icons/io5";
import { IconButton } from "utils/atoms/buttons/IconButton";

// absolute top-1 right-1
export function CustomCloseButton(props) {
  return (
    <IconButton
      {...props}
      icon={<IoClose />}
      color="text-slate-600 hover:text-white"
      bg="bg-transparent hover:bg-red-500"
      size="w-3 h-3"
      twClasses="absolute right-4 z-10"
    />
  );
}
