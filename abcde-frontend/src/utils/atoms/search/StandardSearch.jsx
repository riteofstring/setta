import React from "react";
import { AiOutlineSearch } from "react-icons/ai";
export const StandardSearch = React.forwardRef(
  (
    {
      simpleSearch = false,
      textSize = "text-base",
      placeholder = "Search",
      dropdown = false,
      goButton,
      pad,
      twClasses = "",
      outerClasses = "",
      onKeyPress,
      toggleButtonProps,
      isOpen,
      leftElement = false,
      rightElement = false,
      inputClasses = false,
      input,
      size,
      ...props
    },
    ref
  ) => {
    // prettier-ignore
    const classes = `w-full outline-0 cursor-auto ${textSize} ${pad} ${twClasses}`;

    const handleKeyPress = (event) => {
      if (event.key === "Enter") {
      }
    };

    return (
      <div className={`flex items-center relative nodrag ${outerClasses}`}>
        <div
          className={`${
            simpleSearch ? "w-8 h-8" : "w-10 h-10"
          } absolute left-0 grid place-items-center select-none`}
        >
          {leftElement || <AiOutlineSearch className="text-gray-400" />}
        </div>
        {input || (
          <input
            className={inputClasses || classes}
            placeholder={placeholder}
            ref={ref}
            {...props}
            tabIndex="0"
            // onKeyDown={handleKeyPress}
          />
        )}

        {rightElement}
        {/* <StandardSearchRightButtons
            dropdown={dropdown}
            goButton={goButton}
            simpleSearch={simpleSearch}
            size={size}
            isOpen={isOpen}
            {...props}
          /> */}
      </div>
    );
  }
);
