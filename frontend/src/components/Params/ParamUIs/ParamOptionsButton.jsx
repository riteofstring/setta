import { IconButton } from "components/Utils/atoms/buttons/IconButton";

export function ParamOptionsButton({ variants = "" }) {
  //hover:!bg-white dark:hover:!bg-setta-900
  return (
    <IconButton
      twClasses={`section-value arg-select-btn justify-self-end self-center ${variants}`}
      size="h-3 w-3"
      icon={<i className="gg-check"></i>}
      color={`[&_*]:after:border-transparent [&_*]:hover:after:border-setta-800 dark:[&_*]:hover:after:border-setta-100`}
      bg="bg-transparent p-1 transition-colors duration-150 focus-visible:ring-2"
      // onClick={onClick}
      tabIndex="-1"
    />
  );
}

//
