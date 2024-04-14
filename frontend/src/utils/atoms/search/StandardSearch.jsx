import React from "react";

export const StandardSearch = React.forwardRef(
  (
    {
      placeholder = "Search",
      twClasses = "",
      outerClasses = "",
      noLeftElement = false,
      leftElement = false,
      leftElementStyles,
      rightElement = false,
      inputStyles = false,
      onChange,
      onFormSubmit,
      ...props
    },
    ref,
  ) => {
    const classes = ` flex-grow outline-0 cursor-auto min-w-0 ${twClasses}`;

    return (
      <MaybeForm onFormSubmit={onFormSubmit} outerClasses={outerClasses}>
        {!noLeftElement && (
          <div
            className={`absolute left-0 grid select-none place-items-center ${leftElementStyles}`}
          >
            {leftElement || <i className="gg-sort-az" />}
          </div>
        )}
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
  },
);

function MaybeForm({ onFormSubmit, children, outerClasses }) {
  const styles = `flex min-w-0 items-center relative nodrag dark:text-runcoder-200  ${outerClasses}`;
  return onFormSubmit ? (
    <form className={styles} onSubmit={onFormSubmit}>
      {children}
    </form>
  ) : (
    <section className={styles}>{children}</section>
  );
}
