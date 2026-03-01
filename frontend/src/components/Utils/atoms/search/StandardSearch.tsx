export function StandardSearch({
  placeholder = "Search",
  twClasses = "",
  outerClasses = "",
  noLeftElement = false,
  leftElement = false,
  leftElementStyles,
  rightElement = false,
  inputStyles = false,
  onChange,
  ref,
  ...props
}) {
  const classes = ` flex-grow outline-0 cursor-auto min-w-0 placeholder-setta-300 dark:placeholder-setta-700 ${twClasses}`;
  const styles = `flex min-w-0 mx-[2px] items-center relative nodrag dark:text-setta-200 ${outerClasses}`;

  return (
    <search className={styles}>
      {!noLeftElement && (
        <div
          className={`absolute inset-y-0 left-0 grid select-none place-items-center ${leftElementStyles}`}
        >
          {leftElement || (
            <i className="gg-sort-az ml-[.4rem] !scale-75 text-setta-300 dark:text-setta-600" />
          )}
        </div>
      )}
      <input
        className={inputStyles || classes}
        placeholder={placeholder}
        {...props}
        ref={ref}
        tabIndex={0}
        onChange={onChange}
      />
      <div
        className={`absolute inset-y-0 right-0 grid select-none place-items-center ${leftElementStyles}`}
      >
        {rightElement}
      </div>
    </search>
  );
}
