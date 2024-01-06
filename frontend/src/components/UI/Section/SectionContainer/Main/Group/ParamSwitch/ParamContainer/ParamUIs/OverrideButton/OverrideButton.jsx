import { PiArrowLineUpRightBold } from "react-icons/pi";
import { IconButton } from "utils/atoms/buttons/IconButton";

function OverrideButton({ variants }) {
  return (
    <IconButton
      twClasses={`card-override-btn ${variants}`}
      size="h-2 w-2"
      icon={<PiArrowLineUpRightBold className="" />}
      color="[&>*]:text-transparent group-hover/arg-group:[&>*]:text-runcoder-400"
      bg="bg-transparent group-hover/arg-group:bg-runcoder-100 dark:group-hover/arg-group:bg-runcoder-700 p-1 transition-colors duration-150 hover:bg-runcoder-200  focus-visible:ring-2 dark:! dark:hover:!bg-runcoder-900 z-20"
    />
  );
}

export default OverrideButton;
