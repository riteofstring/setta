import React from "react";
import { IconButton } from "../buttons/IconButton";

export const StandardSearchRightBtn = React.forwardRef(
  ({ rounded, bg, size, icon, ...props }, ref) => {
    return (
      <IconButton
        rounded={rounded || "rounded-full"}
        bg={bg || "bg-transparent"}
        size={size || "w-10 h-10"}
        padding="p-0"
        grid={true}
        twClasses="absolute right-0 hover:bg-blue-500 hover:text-white"
        aria-label="toggle menu"
        icon={icon}
        {...props}
        ref={ref}
      />
    );
  }
);
