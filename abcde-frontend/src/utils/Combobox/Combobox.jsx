import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "@chakra-ui/icons";
import {
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
} from "@chakra-ui/react";
import React from "react";

export const ComboboxInput = React.forwardRef(
  (
    {
      toggleButtonProps,
      dropdown,
      isOpen,
      textSize,
      height = "40px",
      simpleSearch = false,
      size = "normal",
      ...props
    },
    ref
  ) => {
    return (
      <InputGroup
        // width="100%"
        className="nodrag"
        size={size === "small" ? "sm" : "md"}
      >
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <SearchInput
          simpleSearch={simpleSearch}
          height={height}
          size={size}
          textSize={textSize}
          isOpen={isOpen}
          {...props}
          {...toggleButtonProps}
          ref={ref}
        />
        {dropdown && (
          <InputRightElement>
            <IconButton
              {...toggleButtonProps}
              aria-label={"toggle menu"}
              borderRadius={!simpleSearch ? "full" : "2xl"}
              bg={!simpleSearch ? "white" : "unset"}
              icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              // height={height - 10}
              size={size === "small" ? "xs" : "md"}
            />
          </InputRightElement>
        )}
      </InputGroup>
    );
  }
);

const SearchInput = React.forwardRef(
  ({ textSize, height, size, simpleSearch, isOpen, ...props }, ref) => {
    function onClick(e) {
      if (!isOpen) {
        props.onClick(e);
      }
    }

    const commonProps = {
      ...props,
      onClick: onClick,
      placeholder: "Search",
      h: (size === "small" && "32px") || height,
      pl: "2.5rem",
      size: textSize,
    };

    const specificProps = simpleSearch
      ? {
          variant: "flushed",
          bg: "unset",
        }
      : {
          border: 0,
          borderRadius: "full",
          boxShadow: "sm",
        };

    return <Input {...commonProps} {...specificProps} ref={ref} />;
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
