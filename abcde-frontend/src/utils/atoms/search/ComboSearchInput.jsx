import React from "react";
import { StandardSearch } from "./StandardSearch";

export const ComboboxSearchInput = React.forwardRef(
  ({ textSize = "text-base", pad, twClasses = "", ...props }, ref) => {
    // prettier-ignore
    const className = `w-full outline-0 cursor-auto bg-white rounded-full shadow-sm ${textSize} ${pad || "pl-10"} focus-visible:ring-2 ${twClasses}`;

    const handleKeyPress = (event) => {
      if (event.key === "Enter") {
      }
    };

    return <StandardSearch className={className} ref={ref} {...props} />;
  }
);
