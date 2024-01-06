import { MdOutlinePushPin } from "react-icons/md";
import { IconButton } from "utils/atoms/buttons/IconButton";

function PinButton({ variants }) {
  //hover:!bg-white dark:hover:!bg-runcoder-900
  return (
    <IconButton
      twClasses={`card-pin-btn ${variants}`}
      size="h-3 w-3"
      icon={<MdOutlinePushPin />}
      color="[&>*]:text-transparent group-hover/arg-group:[&>*]:text-runcoder-400 dark:group-hover/arg-group:[&>*]:text-runcoder-400 hover:[&>*]:!text-runcoder-800 dark:hover:[&>*]:!text-runcoder-100"
      bg="bg-transparent p-1 transition-colors duration-150 focus-visible:ring-2"
    />
  );
}

export default PinButton;
