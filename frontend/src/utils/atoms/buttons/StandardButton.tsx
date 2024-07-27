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
    inactive = "bg-runcoder-50 dark:bg-runcoder-800",
    hover = "hover:bg-runcoder-200 dark:hover:bg-runcoder-900",
    text = "text-runcoder-700 dark:text-runcoder-100 font-bold",
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
