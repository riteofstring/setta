import React from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { StandardSearchRightBtn } from "utils/atoms/search/StandardSearchRightBtn";

export const ComboboxInput = React.forwardRef(
  ({ toggleButtonProps, isOpen, ...props }, ref) => {
    const searchStyles =
      "w-full outline-0 cursor-auto bg-white rounded-full shadow-sm text-sm h-[40px] pl-10 focus-visible:ring-2";

    return (
      <StandardSearch
        inputStyles={searchStyles}
        leftElementStyles="pl-3"
        {...toggleButtonProps}
        {...props}
        ref={ref}
        rightElement={
          <StandardSearchRightBtn
            {...toggleButtonProps}
            icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
            size="w-10 h-10"
          />
        }
      />
    );
  }
);

export const ComboboxList = React.forwardRef(
  ({ isOpen, children, ...props }, ref) => {
    const display = isOpen ? "flex" : "hidden";
    return (
      <div
        className={`nowheel nodrag ${display} flex-1 items-stretch w-[inherit] max-h-96 mt-2 z-20 rounded-3xl bg-white !overflow-visible fixed shadow-xl`}
        {...props}
        ref={ref}
      >
        {children}
      </div>
    );
  }
);

export const ComboboxItem = React.forwardRef(
  (
    { itemIndex, highlightedIndex, itemStyle = "", children, ...props },
    ref
  ) => {
    const isActive = itemIndex === highlightedIndex;
    const bg = isActive ? "bg-gray-100" : "";
    return (
      <div
        className={`px-4 py-2 cursor-pointer rounded-xl mx-1 my-0.5 ${bg} ${itemStyle}`}
        {...props}
        ref={ref}
        data-testid={"ComboboxListItem"}
      >
        {children}
      </div>
    );
  }
);
