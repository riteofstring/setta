import React from "react";
import { AiOutlineSearch } from "react-icons/ai";
export const StandardSearch = React.forwardRef(
  (
    {
      placeholder = "Search",
      twClasses = "",
      outerClasses = "",
      onKeyPress,
      leftElement = false,
      leftElementStyles,
      rightElement = false,
      inputStyles = false,
      input,
      onChange,
      ...props
    },
    ref
  ) => {
    // prettier-ignore
    const classes = `w-full outline-0 cursor-auto ${twClasses}`;

    const handleKeyPress = (event) => {
      if (event.key === "Enter") {
      }
    };

    return (
      <div className={`flex items-center relative nodrag ${outerClasses}`}>
        <div
          className={`absolute left-0 grid place-items-center select-none
           ${leftElementStyles}`}
        >
          {leftElement || <AiOutlineSearch className="text-gray-400" />}
        </div>
        {input || (
          <input
            className={inputStyles || classes}
            placeholder={placeholder}
            ref={ref}
            {...props}
            tabIndex="0"
            onChange={onChange}
          />
        )}

        {rightElement}
      </div>
    );
  }
);
