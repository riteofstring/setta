import { LuRepeat2 } from "react-icons/lu";
import { IconButton } from "utils/atoms/buttons/IconButton";

function MultirunButton() {
  return (
    <IconButton
      icon={<LuRepeat2 />}
      color="text-runcoder-300"
      bg="bg-transparent p-1 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300"
    />
  );
}

export default MultirunButton;
