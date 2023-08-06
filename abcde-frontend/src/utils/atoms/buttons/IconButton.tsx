import React from "react";
import { Button } from "./Button";

interface IconButtonTypes {
  twClasses?: string;
  size?: string;
  padding?: string;
  bg?: string;
  color?: string;
  rounded?: string;
  icon?: any;
  children?: any;
  theRest?: any;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonTypes>(
  (
    {
      twClasses = "",
      size = "w-3 h-3",
      padding = "py-1 px-1",
      bg = "bg-transparent hover:bg-slate-200 dark:hover:bg-runcoder-600",
      color = "text-slate-500",
      rounded = "rounded-full",
      icon,
      children,
      ...theRest
    },
    ref
  ) => {
    return (
      <Button
        twClasses={`flex justify-center ${bg} ${color} ${rounded} ${padding} ${size} ${twClasses}`}
        {...theRest}
        ref={ref}
        // grid={true}
      >
        {icon}
        {children}
      </Button>
    );
  }
);
