import { forwardRef } from "react";
import { Button } from "./Button";

interface StandardButtonTypes {
  children?: any;
  stdBtnStyles?: string;
  type?: string;
  inactive?: string;
  hover?: string;
  text?: string;
  align?: string;
  theRest?: any;
}

export const StandardButton = forwardRef<
  HTMLButtonElement,
  StandardButtonTypes
>((props, ref) => {
  const {
    children,
    stdBtnStyles,
    type,
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
