import React from "react";
import { StandardSearch } from "./StandardSearch";

export const ComboboxSearchInput = React.forwardRef(
  (
    {
      textSize = "text-base",
      pad = false,
      twClasses = "",
      dropdown,
      simpleSearch,
      size,
      isOpen,
      ...props
    },
    ref
  ) => {
    // prettier-ignore
    const className = `w-full outline-0 cursor-auto bg-white rounded-full shadow-sm text-sm h-[40px] pl-10 focus-visible:ring-2 ${twClasses}`;

    const handleKeyPress = (event) => {
      if (event.key === "Enter") {
      }
    };

    return (
      <StandardSearch
        className={className}
        ref={ref}
        dropdown={dropdown}
        simpleSearch={simpleSearch}
        size={size}
        isOpen={isOpen}
        {...props}
      />
    );
  }
);
