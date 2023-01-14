import { forwardRef } from "react";
import { Button } from "./Button";

export const StandardButton = forwardRef((props, ref) => {
  const {
    children,
    stdBtnStyles,
    inactive = "bg-gray-50",
    hover = "hover:bg-gray-200",
    text = "text-gray-700 font-bold",
    align = "self-center",
    ...theRest
  } = props;
  return (
    <Button
      twClasses={`grid place-items-center py-2 px-4 rounded-full gap-1 ${inactive} ${hover} ${text} ${stdBtnStyles} ${align}`}
      {...theRest}
      ref={ref}
    >
      {children}
    </Button>
  );
});
