import { IconButton } from "utils/atoms/buttons/IconButton";

export function ParamOptionsButton({ variants = "" }) {
  //hover:!bg-white dark:hover:!bg-setta-900
  return (
    <IconButton
      twClasses={`section-value justify-self-end self-center ${variants}`}
      size="h-3 w-3"
      icon={<i className="gg-options"></i>}
      color={`[&>*]:text-transparent group-hover/arg-group:[&>*]:text-setta-400 dark:group-hover/arg-group:[&>*]:text-setta-400 hover:[&>*]:!text-setta-800 dark:hover:[&>*]:!text-setta-100`}
      bg="bg-transparent dark:group-hover/arg-group:bg-setta-800/75 group-hover/arg-group:bg-setta-200/50 p-1 transition-colors duration-150 focus-visible:ring-2"
      // onClick={onClick}
      tabIndex="-1"
    />
  );
}
