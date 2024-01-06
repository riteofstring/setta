import { PiArrowLineUpRightBold } from "react-icons/pi";
import { IconButton } from "utils/atoms/buttons/IconButton";

function OverrideButton({ variants }) {
  return (
    <IconButton
      twClasses={`card-override-btn ${variants}`}
      size="h-2 w-2"
      icon={<PiArrowLineUpRightBold />}
      color="[&>*]:text-transparent group-hover/arg-group:[&>*]:text-white dark:group-hover/arg-group:[&>*]:text-runcoder-400 hover:!text-orange-400"
      bg="bg-transparent group-hover/arg-group:bg-runcoder-400/80 backdrop-blur-[1px] dark:group-hover/arg-group:bg-runcoder-900/40 mb-1 p-1 transition-colors duration-150 hover:!bg-runcoder-600 group-hover/arg-group:backdrop-blur-[.5px]  focus-visible:ring-2 dark:hover:!bg-runcoder-900 z-20"
    />
  );
}

export default OverrideButton;
