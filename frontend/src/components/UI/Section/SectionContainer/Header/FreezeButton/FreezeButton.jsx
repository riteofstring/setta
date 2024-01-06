import { IoSnowSharp } from "react-icons/io5";
import { IconButton } from "utils/atoms/buttons/IconButton";

function FreezeButton() {
  return (
    <IconButton
      icon={<IoSnowSharp />}
      color="text-runcoder-300"
      bg="bg-transparent p-1 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300"
    />
  );
}

export default FreezeButton;
