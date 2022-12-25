import { IoClose } from "react-icons/io5";
import { IconButton } from "utils/atoms/buttons/IconButton";

export default function CustomCloseButton(props) {
  return (
    <IconButton
      {...props}
      icon={<IoClose />}
      color="text-gray-600 hover:text-white"
      bg="bg-transparent hover:bg-red-500"
      size="w-4 h-4"
    />
  );
}
