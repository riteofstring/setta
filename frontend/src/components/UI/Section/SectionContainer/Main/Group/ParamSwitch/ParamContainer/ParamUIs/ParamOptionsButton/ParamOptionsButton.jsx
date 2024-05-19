import { IconButton } from "utils/atoms/buttons/IconButton";

export function ParamOptionsButton({ variants = "" }) {
  //hover:!bg-white dark:hover:!bg-runcoder-900
  return (
    <IconButton
      twClasses={` ${variants}`}
      size="h-3 w-3"
      icon={<i className="gg-options"></i>}
      color={`[&>*]:text-transparent group-hover/arg-group:[&>*]:text-runcoder-400 dark:group-hover/arg-group:[&>*]:text-runcoder-400 hover:[&>*]:!text-runcoder-800 dark:hover:[&>*]:!text-runcoder-100`}
      bg="bg-transparent dark:group-hover/arg-group:bg-runcoder-800/75 group-hover/arg-group:bg-runcoder-200/50 p-1 transition-colors duration-150 focus-visible:ring-2"
      // onClick={onClick}
      tabIndex="-1"
    />
  );
}
