import React from "react";

export const StandardSearch = React.forwardRef(
  (
    {
      placeholder = "Search",
      outerClasses = "",
      noLeftElement = false,
      leftElement = false,
      leftElementStyles,
      rightElement = false,
      inputStyles,
      onChange,
      ...props
    },
    ref,
  ) => {
    return (
      <search
        className={`nodrag relative mx-[2px] flex min-w-0 items-center dark:text-setta-200 ${outerClasses}`}
      >
        {!noLeftElement && (
          <div
            className={`absolute left-0 grid select-none place-items-center ${leftElementStyles}`}
          >
            {leftElement || (
              <i className="gg-sort-az ml-[.4rem] !scale-75 text-setta-300 dark:text-setta-600" />
            )}
          </div>
        )}
        <input
          className={inputStyles}
          placeholder={placeholder}
          {...props}
          ref={ref}
          tabIndex="0"
          onChange={onChange}
        />
        <div
          className={`absolute right-0 grid select-none place-items-center ${leftElementStyles}`}
        >
          {rightElement}
        </div>
      </search>
    );
  },
);
