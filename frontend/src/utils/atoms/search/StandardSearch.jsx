import React from "react";
import { AiOutlineSearch } from "react-icons/ai";

export const StandardSearch = React.forwardRef(
  (
    {
      placeholder = "Search",
      twClasses = "",
      outerClasses = "",
      leftElement = false,
      leftElementStyles,
      rightElement = false,
      inputStyles = false,
      onChange,
      onFormSubmit,
      ...props
    },
    ref
  ) => {
    const classes = `w-full flex-grow outline-0 cursor-auto ${twClasses}`;

    return (
      <MaybeForm onFormSubmit={onFormSubmit} outerClasses={outerClasses}>
        <div
          className={`absolute left-0 grid select-none place-items-center ${leftElementStyles}`}
        >
          {leftElement || (
            <AiOutlineSearch className="self-center text-slate-400" />
          )}
        </div>
        <input
          className={inputStyles || classes}
          placeholder={placeholder}
          {...props}
          ref={ref}
          tabIndex="0"
          onChange={onChange}
        />
        {rightElement}
      </MaybeForm>
    );
  }
);

function MaybeForm({ onFormSubmit, children, outerClasses }) {
  const styles = `flex items-center relative nodrag dark:text-runcoder-200  ${outerClasses}`;
  return onFormSubmit ? (
    <form className={styles} onSubmit={onFormSubmit}>
      {children}
    </form>
  ) : (
    <section className={styles}>{children}</section>
  );
}
