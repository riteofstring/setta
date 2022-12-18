import React from "react";
import { AiOutlineSearch } from "react-icons/ai";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import IconButton from "utils/atoms/buttons/IconButton";

export const ComboboxInput = React.forwardRef(
  (
    {
      toggleButtonProps,
      dropdown,
      isOpen,
      textSize,
      height,
      simpleSearch = false,
      ...props
    },
    ref
  ) => {
    return (
      <div className="flex relative nodrag">
        <div className="w-10 h-10 absolute left-0 grid place-items-center select-none">
          <AiOutlineSearch className="text-gray-400" />
        </div>

        <SearchInput
          simpleSearch={simpleSearch}
          height={height}
          textSize={textSize}
          {...props}
          {...toggleButtonProps}
          ref={ref}
        />
        {dropdown && (
          <IconButton
            rounded={`${!simpleSearch ? "rounded-full" : "rounded-2xl"}`}
            bg={` ${!simpleSearch ? "bg-white" : "bg-transparent"}`}
            size="w-10 h-10"
            padding="p-0"
            grid={true}
            twClasses="absolute right-0 hover:bg-gray-100"
            {...toggleButtonProps}
            aria-label={"toggle menu"}
            icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
          />
        )}
      </div>
    );
  }
);

const SearchInput = React.forwardRef(
  (
    { textSize = "text-sm", height = "h-[40px]", simpleSearch, ...props },
    ref
  ) => {
    const otherStyling = simpleSearch
      ? "bg-transparent"
      : "bg-white rounded-full border-0 shadow-sm";

    const className = `${otherStyling} ${height} ${textSize} pl-10 w-full outline-0 cursor-auto`;

    return (
      <input
        className={`${className} focus:ring-2`}
        placeholder="Search"
        ref={ref}
        {...props}
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
